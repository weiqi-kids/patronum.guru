// patronum-api
//
// 留言（comments）與「提議新門檻」（topic_suggestions）的後端。
// 純 Workers + D1，無第三方。讀者不用任何帳號就能留言。
//
// 端點：
//   GET    /api/comments?slug=<slug>   讀某篇的留言（公開）
//   POST   /api/comments               留言（公開）{ slug, name?, body, website? }
//   POST   /api/topics                 提議新門檻（公開）{ title, note?, website? }
//   GET    /api/topics                 看所有提議（需管理密鑰）
//   DELETE /api/comments/:id           隱藏一則留言（需管理密鑰）
//
// 防濫用：欄位長度上限、同 IP 限流、蜜罐欄位（website）、輸出由前端以 textContent 呈現。

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  ADMIN_TOKEN: string;
}

const MAX_BODY = 2000;
const MAX_NAME = 40;
const MAX_TITLE = 120;
const MAX_NOTE = 2000;
const RATE_MAX = 5; // 每個視窗最多幾則
const RATE_WINDOW = 60; // 秒

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = origin !== null && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + salt));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

// 去掉控制字元、trim、截斷到 max。
function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

function isAdmin(req: Request, env: Env): boolean {
  return req.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`;
}

async function tooMany(env: Env, table: string, ipHash: string, now: number): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT count(*) AS c FROM ${table} WHERE ip_hash = ? AND created_at > ?`,
  )
    .bind(ipHash, now - RATE_WINDOW)
    .first<{ c: number }>();
  return row !== null && row.c >= RATE_MAX;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      // ── 讀留言（公開）──
      if (req.method === 'GET' && pathname === '/api/comments') {
        const slug = clean(url.searchParams.get('slug'), 200);
        if (!slug) return json({ error: 'slug required' }, 400, cors);
        const { results } = await env.DB.prepare(
          'SELECT id, name, body, created_at FROM comments WHERE slug = ? AND hidden = 0 ORDER BY created_at ASC LIMIT 500',
        )
          .bind(slug)
          .all();
        return json({ comments: results }, 200, cors);
      }

      // ── 留言（公開）──
      if (req.method === 'POST' && pathname === '/api/comments') {
        const data = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        if (clean(data.website, 100)) return json({ ok: true }, 200, cors); // 蜜罐：靜默成功
        const slug = clean(data.slug, 200);
        const body = clean(data.body, MAX_BODY);
        const name = clean(data.name, MAX_NAME) || '一位路過的人';
        if (!slug || body.length < 1) return json({ error: '請寫點什麼再送出。' }, 400, cors);
        const ipHash = await hashIp(req.headers.get('CF-Connecting-IP') ?? '', env.ADMIN_TOKEN);
        const now = Math.floor(Date.now() / 1000);
        if (await tooMany(env, 'comments', ipHash, now)) {
          return json({ error: '慢一點，過一下再留。' }, 429, cors);
        }
        await env.DB.prepare(
          'INSERT INTO comments (slug, name, body, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)',
        )
          .bind(slug, name, body, now, ipHash)
          .run();
        return json({ ok: true, comment: { name, body, created_at: now } }, 201, cors);
      }

      // ── 提議新門檻（公開）──
      if (req.method === 'POST' && pathname === '/api/topics') {
        const data = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        if (clean(data.website, 100)) return json({ ok: true }, 200, cors); // 蜜罐
        const title = clean(data.title, MAX_TITLE);
        const note = clean(data.note, MAX_NOTE);
        if (title.length < 1) return json({ error: '想提議哪一道門呢？' }, 400, cors);
        const ipHash = await hashIp(req.headers.get('CF-Connecting-IP') ?? '', env.ADMIN_TOKEN);
        const now = Math.floor(Date.now() / 1000);
        if (await tooMany(env, 'topic_suggestions', ipHash, now)) {
          return json({ error: '慢一點，過一下再說。' }, 429, cors);
        }
        await env.DB.prepare(
          'INSERT INTO topic_suggestions (title, note, created_at, ip_hash) VALUES (?, ?, ?, ?)',
        )
          .bind(title, note, now, ipHash)
          .run();
        return json({ ok: true }, 201, cors);
      }

      // ── 管理：看所有提議 ──
      if (req.method === 'GET' && pathname === '/api/topics') {
        if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
        const { results } = await env.DB.prepare(
          'SELECT id, title, note, created_at, status FROM topic_suggestions ORDER BY created_at DESC LIMIT 500',
        ).all();
        return json({ topics: results }, 200, cors);
      }

      // ── 管理：隱藏一則留言 ──
      if (req.method === 'DELETE' && pathname.startsWith('/api/comments/')) {
        if (!isAdmin(req, env)) return json({ error: 'unauthorized' }, 401, cors);
        const id = Number(pathname.slice('/api/comments/'.length));
        if (!Number.isInteger(id)) return json({ error: 'bad id' }, 400, cors);
        await env.DB.prepare('UPDATE comments SET hidden = 1 WHERE id = ?').bind(id).run();
        return json({ ok: true }, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch {
      return json({ error: 'server error' }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;
