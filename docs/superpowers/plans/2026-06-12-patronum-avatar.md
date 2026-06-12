# 守護者 Patronum 具象化語音 widget 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在文章頁加一個常駐光霧守護形，可播放預錄音檔朗讀文章，並就該篇做限定範圍的文字問答。

**Architecture:** 前端 `GuardianWidget.astro`（沿用既有 `.astro` + 內嵌 client script + fetch Worker 模式，無新框架）掛進 `Article.astro`；以 `<audio>` + Web Audio `AnalyserNode` 驅動 Canvas 光霧視覺。後端在既有 Cloudflare Worker `patronum-api` 加 `POST /api/ask`，以 raw fetch 呼叫 Anthropic Messages API（Claude Haiku），守護者人設＋拒答紀律由 system prompt 約束。朗讀音檔由站長手動放 `public/audio/<slug>.mp3`。

**Tech Stack:** Astro 5（static）、vanilla TS client script、Web Audio API、Canvas 2D、Cloudflare Workers + D1、Anthropic Messages API（`claude-haiku-4-5`，raw HTTPS fetch）、vitest。

**關於 Anthropic 呼叫用 raw fetch 而非官方 SDK：** worker 子專案的設計原則是「純 Workers + D1，無第三方」（見 `worker/README.md`、`worker/src/index.ts` 檔頭）。此專案約束優先於「預設用官方 SDK」的通則，故 `/api/ask` 以 raw fetch 呼叫 Messages API，不引入 `@anthropic-ai/sdk`。請求格式依 Anthropic Messages API：`POST https://api.anthropic.com/v1/messages`，headers `x-api-key` / `anthropic-version: 2023-06-01` / `content-type: application/json`。

---

## 檔案結構

| 檔案 | 職責 | 動作 |
|------|------|------|
| `vitest.config.ts` | 測試範圍 | 修改：include 加 `worker/**/*.test.ts`（現有是 `workers/**` 拼字不符目錄） |
| `worker/migrations/0002_ask_log.sql` | 限流計數表 | 新增 |
| `worker/src/ask.ts` | Q&A 純函式：守護者 system prompt、輸入驗證、prompt 組裝、Claude 呼叫 | 新增 |
| `worker/src/ask.test.ts` | `ask.ts` 純函式單元測試 | 新增 |
| `worker/src/index.ts` | 路由 `POST /api/ask`，Env 加 `ANTHROPIC_API_KEY` | 修改 |
| `src/utils/avatar-visual.ts` | 音量→視覺參數的純對應函式 | 新增 |
| `src/utils/avatar-visual.test.ts` | 對應函式單元測試 | 新增 |
| `src/components/blocks/GuardianWidget.astro` | 光霧 widget：視覺、朗讀、問答 | 新增 |
| `src/layouts/Article.astro` | 掛載 widget | 修改 |
| `public/audio/.gitkeep` | 朗讀音檔目錄佔位 | 新增 |
| `README.md` / `AGENTS.md` / `worker/README.md` | 文件同步 | 修改 |

實作順序：先後端（Phase A，可獨立用 `wrangler dev` 驗證），再前端（Phase B）。

---

## Phase A — Worker `/api/ask`

### Task A1: 測試範圍與 ask_log migration

**Files:**
- Modify: `vitest.config.ts`
- Create: `worker/migrations/0002_ask_log.sql`

- [ ] **Step 1: 修正 vitest include（worker 測試才會被收）**

`vitest.config.ts` 目前的 `include` 寫 `workers/**`（複數，與目錄 `worker/` 不符）。改成包含 worker：

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'worker/**/*.test.ts',
      'engine/**/*.test.ts',
    ],
    environment: 'node',
  },
});
```

- [ ] **Step 2: 建立 ask_log migration**

`worker/migrations/0002_ask_log.sql`（只為限流計數，不存問題內容）：

```sql
-- patronum-api：/api/ask 限流計數表（只存 ip 雜湊與時間，不存問題內容）
CREATE TABLE IF NOT EXISTS ask_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ask_log_ip ON ask_log (ip_hash, created_at);
```

- [ ] **Step 3: 驗證 vitest 設定可被解析（現有測試仍綠）**

Run: `pnpm vitest run`
Expected: 既有 104 測試通過，無 config 解析錯誤。

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts worker/migrations/0002_ask_log.sql
git commit -m "chore(worker): ask_log migration + vitest 收 worker 測試 [skip docs]"
```

---

### Task A2: `worker/src/ask.ts` 純函式（TDD）

純函式：守護者 system prompt 常數、輸入驗證、user prompt 組裝。這些可在 node 環境單元測試，不需 Workers runtime 或 D1。

**Files:**
- Create: `worker/src/ask.ts`
- Test: `worker/src/ask.test.ts`

- [ ] **Step 1: 寫 failing 測試**

`worker/src/ask.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { validateAsk, buildAskUserPrompt, GUARDIAN_SYSTEM, MAX_QUESTION, MAX_CONTEXT } from './ask';

describe('validateAsk', () => {
  it('蜜罐 website 有值時回 honeypot', () => {
    const r = validateAsk({ slug: 'x', question: 'hi', website: 'bot' });
    expect(r.kind).toBe('honeypot');
  });

  it('缺 slug 時回 bad', () => {
    const r = validateAsk({ question: 'hi' });
    expect(r.kind).toBe('bad');
  });

  it('缺 question 時回 bad', () => {
    const r = validateAsk({ slug: 'x' });
    expect(r.kind).toBe('bad');
  });

  it('合法輸入回 ok 並清理/截斷欄位', () => {
    const r = validateAsk({ slug: 'coming-of-age', question: '  這篇在講什麼  ', context: 'C'.repeat(MAX_CONTEXT + 50) });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.slug).toBe('coming-of-age');
    expect(r.question).toBe('這篇在講什麼');
    expect(r.context.length).toBe(MAX_CONTEXT);
  });

  it('question 超長時截斷到 MAX_QUESTION', () => {
    const r = validateAsk({ slug: 'x', question: 'q'.repeat(MAX_QUESTION + 100) });
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.question.length).toBe(MAX_QUESTION);
  });
});

describe('buildAskUserPrompt', () => {
  it('把 context 與 question 都帶進去', () => {
    const p = buildAskUserPrompt('文章正文內容', '為什麼東亞晚離家');
    expect(p).toContain('文章正文內容');
    expect(p).toContain('為什麼東亞晚離家');
  });
});

describe('GUARDIAN_SYSTEM', () => {
  it('含守護者人設與拒答紀律關鍵字', () => {
    expect(GUARDIAN_SYSTEM).toContain('守望');
    expect(GUARDIAN_SYSTEM).toContain('不裁決');
    expect(GUARDIAN_SYSTEM).toContain('AI');
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run worker/src/ask.test.ts`
Expected: FAIL（`Cannot find module './ask'`）。

- [ ] **Step 3: 寫實作**

`worker/src/ask.ts`：

```ts
// worker/src/ask.ts
//
// /api/ask 的純函式：守護者 system prompt、輸入驗證、user prompt 組裝、Claude 呼叫。
// 純函式（GUARDIAN_SYSTEM / validateAsk / buildAskUserPrompt）可在 node 環境單元測試；
// callClaude 走 raw fetch（無第三方 SDK，遵守 worker 子專案的零依賴原則）。

export const MAX_QUESTION = 500;
export const MAX_CONTEXT = 8000;

// 守護者人設 + 拒答紀律。對齊 AGENTS.md 寫作鐵律：第一人稱守望者、據實標示 AI、
// 只呈現光譜不裁決、拒答裁決/人生處方、不本質化、不杜撰來源、限定在這篇文章。
export const GUARDIAN_SYSTEM = `你是 Patronum，站在人生門檻前的守護者，採第一人稱「我」的守望視角。
你正在回答讀者對「當前這篇文章」的提問。

立場鐵則（違反即失敗）：
- 你是 AI 守望者。若被問及身份，據實說明你是 AI，不假裝人類、不假裝有人生經歷。
- 只就這篇文章談到的家庭與人生階段、跨文化光譜作答。問題超出這篇範圍時，溫和說明你只守這道門。
- 呈現光譜，不裁決。不說哪個文化或哪種人生選擇比較好、比較對、比較成熟。
- 拒答「我該怎麼選／哪個比較好／你建議哪一種」這類要你做選擇或開人生處方的問題。
  改成把不同處境的拉力攤開，把選擇權留給對方。
- 不本質化（不說某地人天生如何），把態度差異歸因於處境、制度、歷史。
- 不杜撰來源或數字。文章沒提到的事實，就說你不確定。
- 用繁體中文、台灣用語。語氣溫柔平實。不要破折號，不要排比，不要「不是…而是…」框架，
  不要油膩的三段式收尾。
回答控制在一到兩段。`;

export function buildAskUserPrompt(context: string, question: string): string {
  return `這是讀者正在看的文章內容：
<article>
${context}
</article>

讀者的問題：${question}`;
}

export type AskValidation =
  | { kind: 'honeypot' }
  | { kind: 'bad'; error: string }
  | { kind: 'ok'; slug: string; question: string; context: string };

// 去控制字元、trim、截斷。與 worker/src/index.ts 的 clean() 同義，獨立放這裡以利純測試。
// 控制字元用 codePoint 過濾，避免在文件/編輯器裡寫字面控制字元 regex 被吃掉。
function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  const stripped = Array.from(s)
    .filter((ch) => {
      const c = ch.codePointAt(0) as number;
      // 去掉 C0 控制字元（0x00–0x1F）與 DEL（0x7F）；\t\n\r 也一併去掉，trim 不受影響。
      return c > 0x1f && c !== 0x7f;
    })
    .join('');
  return stripped.trim().slice(0, max);
}

export function validateAsk(data: Record<string, unknown>): AskValidation {
  if (clean(data.website, 100)) return { kind: 'honeypot' };
  const slug = clean(data.slug, 200);
  const question = clean(data.question, MAX_QUESTION);
  const context = clean(data.context, MAX_CONTEXT);
  if (!slug) return { kind: 'bad', error: 'slug required' };
  if (question.length < 1) return { kind: 'bad', error: '想問什麼呢？' };
  return { kind: 'ok', slug, question, context };
}

// raw fetch 呼叫 Anthropic Messages API。回傳守護者的文字答覆。
// 失敗（網路、非 2xx、refusal、無文字）時 throw，由 handler 轉成降級訊息。
export async function callClaude(apiKey: string, context: string, question: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: GUARDIAN_SYSTEM,
      messages: [{ role: 'user', content: buildAskUserPrompt(context, question) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = (await res.json()) as {
    stop_reason?: string;
    content?: Array<{ type: string; text?: string }>;
  };
  if (data.stop_reason === 'refusal') throw new Error('refusal');
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('')
    .trim();
  if (!text) throw new Error('empty answer');
  return text;
}
```

注意：測試案例「question 截斷」用 `'q'.repeat(MAX_QUESTION + 100)`（全為一般字元），`clean` 過濾不會動到它，只截斷到 `MAX_QUESTION`，符合斷言。

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run worker/src/ask.test.ts`
Expected: PASS（7 個測試）。

- [ ] **Step 5: Commit**

```bash
git add worker/src/ask.ts worker/src/ask.test.ts
git commit -m "feat(worker): 守護者問答純函式（驗證/prompt/Claude 呼叫）+ 測試 [skip docs]"
```

---

### Task A3: 把 `/api/ask` 接進 worker handler

**Files:**
- Modify: `worker/src/index.ts`

handler 內 D1 與 fetch 的接線不在本專案的單元測試範圍（既有 worker 零測試、無 Workers runtime test 基建），以 `wrangler dev` 本機手動驗證。

- [ ] **Step 1: Env 介面加 `ANTHROPIC_API_KEY`**

`worker/src/index.ts` 的 `Env`：

```ts
export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  ADMIN_TOKEN: string;
  ANTHROPIC_API_KEY: string;
}
```

- [ ] **Step 2: import ask 模組**

`worker/src/index.ts` 目前無 import。在檔頭註解之後、`export interface Env` 之前加：

```ts
import { validateAsk, callClaude } from './ask';
```

- [ ] **Step 3: 加 `/api/ask` 路由分支**

在 `worker/src/index.ts` 的 `try {` 區塊內、`// ── 提議新門檻（公開）──` 分支之後、`// ── 管理：看所有提議 ──` 之前，插入：

```ts
      // ── 守護者問答（公開）──
      if (req.method === 'POST' && pathname === '/api/ask') {
        const data = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const v = validateAsk(data);
        if (v.kind === 'honeypot') return json({ ok: true, answer: '' }, 200, cors);
        if (v.kind === 'bad') return json({ error: v.error }, 400, cors);
        if (!env.ANTHROPIC_API_KEY) return json({ error: '守護者暫時無法回應。' }, 503, cors);
        const ipHash = await hashIp(req.headers.get('CF-Connecting-IP') ?? '', env.ADMIN_TOKEN);
        const now = Math.floor(Date.now() / 1000);
        if (await tooMany(env, 'ask_log', ipHash, now)) {
          return json({ error: '慢一點，過一下再問。' }, 429, cors);
        }
        await env.DB.prepare('INSERT INTO ask_log (ip_hash, created_at) VALUES (?, ?)')
          .bind(ipHash, now)
          .run();
        try {
          const answer = await callClaude(env.ANTHROPIC_API_KEY, v.context, v.question);
          return json({ ok: true, answer }, 200, cors);
        } catch {
          return json({ error: '守護者暫時無法回應，等一下再問。' }, 502, cors);
        }
      }
```

說明：`tooMany`、`hashIp`、`json`、`corsHeaders` 都是 `index.ts` 既有工具，直接重用；`ask_log` 是 Task A1 建的表。`OPTIONS` preflight 由檔案頂部既有分支處理，`/api/ask` 不需另寫。

- [ ] **Step 4: 本機型別檢查（worker 自己的 tsconfig）**

Run: `cd worker && pnpm exec wrangler deploy --dry-run --outdir=/tmp/ask-dryrun`
Expected: bundling 成功（`ANTHROPIC_API_KEY` 已在 Env；ask 模組型別對齊）。完成後 `rm -rf /tmp/ask-dryrun`。

- [ ] **Step 5: 本機冒煙測試（手動）**

開兩個終端。終端一啟動本機 worker（用 `.dev.vars` 放測試密鑰；`.dev.vars` 已被 gitignore）：

```bash
cd worker
printf 'ANTHROPIC_API_KEY=sk-ant-REPLACE\n' >> .dev.vars   # 你的測試金鑰
pnpm exec wrangler dev --local
```

終端二打 API（缺欄位 → 400；正常 → 200 有 answer）：

```bash
curl -s -X POST localhost:8787/api/ask -H 'content-type: application/json' \
  -d '{"slug":"coming-of-age-east-asia-vs-west"}'
# 預期 400 {"error":"想問什麼呢？"}

curl -s -X POST localhost:8787/api/ask -H 'content-type: application/json' \
  -d '{"slug":"coming-of-age-east-asia-vs-west","question":"這篇在講什麼？","context":"在東亞，長大常被看成能不能扛起家裡。"}'
# 預期 200 {"ok":true,"answer":"我守在這道門前…（守護者第一人稱、不裁決）"}
```

驗收：answer 為守護者第一人稱、不對文化下對錯。問「我到底該不該搬出去」時，應拒答並把光譜攤開。
完成後務必把測試金鑰從 `.dev.vars` 移除（該行刪掉），不要留存。

- [ ] **Step 6: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): POST /api/ask 守護者問答端點（限流+IP雜湊+降級） [skip docs]"
```

---

### Task A4: 後端文件同步

**Files:**
- Modify: `worker/README.md`, `AGENTS.md`

- [ ] **Step 1: worker/README 加端點與 secret**

在 `worker/README.md` 的「## 端點」表格加一列：

```markdown
| POST | `/api/ask` | 公開 | 問當前文章 `{slug,question,context}` → `{answer}` |
```

並在「## 一次性部署」的 `pnpm exec wrangler secret put ADMIN_TOKEN` 之後加：

```bash
# 守護者問答用的 Anthropic 金鑰
pnpm exec wrangler secret put ANTHROPIC_API_KEY
```

- [ ] **Step 2: AGENTS.md 規範守護者問答**

在 `AGENTS.md`「去 AI 感文字限制」小節之後，加一段：

```markdown
### 守護者問答（/api/ask）
文章頁的守護者問答（Worker `/api/ask` → Claude）必須守住本節所有寫作鐵律與「呈現光譜不裁決」原則：第一人稱守望者、據實標示 AI、拒答裁決／人生處方類問題、不本質化、不杜撰來源、只就當前文章作答。system prompt 在 `worker/src/ask.ts` 的 `GUARDIAN_SYSTEM`，調整人設或拒答規則時改這裡。
```

- [ ] **Step 3: Commit（這次不加 [skip docs]，本來就是文件）**

```bash
git add worker/README.md AGENTS.md
git commit -m "docs(worker): /api/ask 端點、ANTHROPIC_API_KEY secret、守護者問答規範"
```

---

## Phase B — 前端 widget

### Task B1: 音量→視覺對應純函式（TDD）

把「音量振幅 → 光暈強度／縮放」抽成純函式，便於單元測試；DOM/Canvas/Audio 的接線在 B2 手動驗證。

**Files:**
- Create: `src/utils/avatar-visual.ts`
- Test: `src/utils/avatar-visual.test.ts`

- [ ] **Step 1: 寫 failing 測試**

`src/utils/avatar-visual.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { ampToVisual } from './avatar-visual';

describe('ampToVisual', () => {
  it('靜音時回基準值（最小光暈、縮放 1）', () => {
    const v = ampToVisual(0);
    expect(v.glow).toBeCloseTo(0.2, 5);
    expect(v.scale).toBeCloseTo(1, 5);
  });

  it('最大音量時光暈與縮放達上限', () => {
    const v = ampToVisual(1);
    expect(v.glow).toBeCloseTo(1, 5);
    expect(v.scale).toBeCloseTo(1.12, 5);
  });

  it('輸入超出 [0,1] 會夾住', () => {
    expect(ampToVisual(-5).glow).toBeCloseTo(0.2, 5);
    expect(ampToVisual(9).glow).toBeCloseTo(1, 5);
  });

  it('單調遞增', () => {
    expect(ampToVisual(0.3).glow).toBeLessThan(ampToVisual(0.7).glow);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run src/utils/avatar-visual.test.ts`
Expected: FAIL（`Cannot find module './avatar-visual'`）。

- [ ] **Step 3: 寫實作**

`src/utils/avatar-visual.ts`：

```ts
// src/utils/avatar-visual.ts
// 音量振幅（0..1）對應到光霧守護形的視覺參數，取代字面嘴型。
// 純函式：方便單元測試；Canvas 繪製在 GuardianWidget 的 client script 取用。

export interface AvatarVisual {
  /** 光暈強度 0.2（待機底）..1（朗讀峰值）。 */
  glow: number;
  /** 整體縮放 1..1.12（呼吸式脈動）。 */
  scale: number;
}

const GLOW_MIN = 0.2;
const GLOW_MAX = 1;
const SCALE_MIN = 1;
const SCALE_MAX = 1.12;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function ampToVisual(amplitude: number): AvatarVisual {
  const a = clamp01(amplitude);
  return {
    glow: GLOW_MIN + (GLOW_MAX - GLOW_MIN) * a,
    scale: SCALE_MIN + (SCALE_MAX - SCALE_MIN) * a,
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm vitest run src/utils/avatar-visual.test.ts`
Expected: PASS（4 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/avatar-visual.ts src/utils/avatar-visual.test.ts
git commit -m "feat(avatar): 音量→視覺對應純函式 + 測試 [skip docs]"
```

---

### Task B2: `GuardianWidget.astro` 元件 + 掛載

光霧視覺、朗讀、問答的完整 widget。沿用 `Comments.astro` 的 `.astro` + 內嵌 `<script>` + `data-*` + fetch Worker 模式，並用 `withBase()` 解析音檔 URL。DOM/Canvas/Audio/網路屬整合層，以手動驗收為主。

**Files:**
- Create: `src/components/blocks/GuardianWidget.astro`
- Modify: `src/layouts/Article.astro`

- [ ] **Step 1: 建立元件**

`src/components/blocks/GuardianWidget.astro`：

```astro
---
// 守護者 Patronum 具象化 widget：右下角常駐光霧形。
// 兩功能：(1) 播放 public/audio/<slug>.mp3 朗讀文章（音量驅動視覺）；
//         (2) 就這篇文章打字問答（POST /api/ask，純文字回答，不發聲）。
// 沿用 Comments.astro 的 .astro + client script + fetch Worker 模式，無新框架。
import { withBase } from '@/utils/url';

interface Props {
  slug: string;
}
const { slug } = Astro.props;
const apiBase = import.meta.env.PUBLIC_PATRONUM_API ?? '';
const audioSrc = withBase(`/audio/${slug}.mp3`);
---

<aside
  class="guardian"
  data-api={apiBase}
  data-slug={slug}
  data-audio={audioSrc}
  aria-label="守護者 Patronum"
>
  <button class="guardian__toggle" type="button" data-toggle aria-expanded="false" aria-controls="guardian-panel">
    <canvas class="guardian__canvas" data-canvas width="72" height="72" aria-hidden="true"></canvas>
    <span class="guardian__sigil-fallback" aria-hidden="true">守望</span>
    <span class="sr-only">打開守護者</span>
  </button>

  <div class="guardian__panel" id="guardian-panel" data-panel hidden>
    <p class="guardian__intro">我守在這道門前。要我念給你聽，或想問這篇的事，都可以。</p>

    <div class="guardian__read">
      <button class="guardian__play" type="button" data-play hidden>讓守護者念給你聽</button>
      <span class="guardian__readstatus" data-readstatus aria-live="polite"></span>
    </div>

    <form class="guardian__form" data-form>
      <textarea
        name="question"
        maxlength="500"
        rows="2"
        required
        class="guardian__q"
        placeholder="問問這篇文章的事"></textarea>
      <input type="text" name="website" tabindex="-1" autocomplete="off" class="guardian__hp" aria-hidden="true" />
      <button type="submit" class="guardian__send">問</button>
    </form>
    <p class="guardian__answer" data-answer aria-live="polite"></p>
  </div>
</aside>

<script>
  import { ampToVisual } from '@/utils/avatar-visual';

  document.querySelectorAll<HTMLElement>('.guardian').forEach((root) => {
    const api = (root.dataset.api ?? '').replace(/\/$/, '');
    const audioSrc = root.dataset.audio ?? '';
    const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]')!;
    const toggle = root.querySelector<HTMLButtonElement>('[data-toggle]')!;
    const panel = root.querySelector<HTMLElement>('[data-panel]')!;
    const playBtn = root.querySelector<HTMLButtonElement>('[data-play]')!;
    const readStatus = root.querySelector<HTMLElement>('[data-readstatus]')!;
    const form = root.querySelector<HTMLFormElement>('[data-form]')!;
    const answerEl = root.querySelector<HTMLElement>('[data-answer]')!;
    const sendBtn = form.querySelector('button')!;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');

    // ── 視覺狀態機 ──
    type State = 'idle' | 'reading' | 'thinking';
    let state: State = 'idle';
    let liveAmp = 0; // reading 時由 analyser 餵入
    let t = 0;

    function draw() {
      if (!ctx) return;
      t += 0.03;
      const breathing = (Math.sin(t) + 1) / 2; // 0..1
      const amp = state === 'reading' ? liveAmp : breathing * (state === 'thinking' ? 0.6 : 0.35);
      const { glow, scale } = ampToVisual(amp);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const r = (w / 2 - 6) * scale;
      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      // 光霧：銀霧白核心 → 暮色靛邊，半透明
      grad.addColorStop(0, `rgba(245, 244, 250, ${0.35 + glow * 0.5})`);
      grad.addColorStop(1, 'rgba(99, 102, 180, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      if (!reduceMotion) requestAnimationFrame(draw);
    }
    // reduced-motion：畫一次靜態光形即可；否則進入動畫迴圈
    draw();

    // ── 朗讀（Web Audio 音量驅動）──
    let audio: HTMLAudioElement | null = null;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let freq: Uint8Array | null = null;

    // 探測音檔是否存在；不存在則隱藏朗讀鈕
    if (audioSrc) {
      fetch(audioSrc, { method: 'HEAD' })
        .then((r) => {
          if (r.ok) playBtn.hidden = false;
          else readStatus.textContent = '朗讀即將開放。';
        })
        .catch(() => {
          readStatus.textContent = '朗讀即將開放。';
        });
    }

    function pumpAmp() {
      if (state !== 'reading' || !analyser || !freq) return;
      analyser.getByteFrequencyData(freq);
      let sum = 0;
      for (let i = 0; i < freq.length; i += 1) sum += freq[i];
      liveAmp = Math.min(1, sum / freq.length / 128);
      requestAnimationFrame(pumpAmp);
    }

    function resetToIdle() {
      state = 'idle';
      liveAmp = 0;
      playBtn.textContent = '讓守護者念給你聽';
      if (reduceMotion) draw();
    }

    playBtn.addEventListener('click', () => {
      if (!audio) {
        audio = new Audio(audioSrc);
        audio.addEventListener('ended', resetToIdle);
        try {
          const AC =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioCtx = new AC();
          const srcNode = audioCtx.createMediaElementSource(audio);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          freq = new Uint8Array(analyser.frequencyBinCount);
          srcNode.connect(analyser);
          analyser.connect(audioCtx.destination);
        } catch {
          // Web Audio 不支援：照樣播，只是沒有音量驅動動效
          analyser = null;
        }
      }
      if (audio.paused) {
        audioCtx?.resume();
        audio
          .play()
          .then(() => {
            state = 'reading';
            playBtn.textContent = '暫停';
            if (reduceMotion) draw();
            pumpAmp();
          })
          .catch(() => {
            readStatus.textContent = '朗讀暫時播不出來。';
          });
      } else {
        audio.pause();
        resetToIdle();
      }
    });

    // ── 開合 ──
    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });

    // ── 問答 ──
    if (!api) sendBtn.disabled = true;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!api) {
        answerEl.textContent = '守護者暫時無法回應。';
        return;
      }
      const fd = new FormData(form);
      const question = String(fd.get('question') ?? '').trim();
      if (!question) return;
      // grounding：直接讀頁面正文（.prose）
      const context = (document.querySelector('.prose')?.textContent ?? '').trim().slice(0, 8000);
      const wasReading = state === 'reading';
      sendBtn.disabled = true;
      if (!wasReading) {
        state = 'thinking';
        if (reduceMotion) draw();
      }
      answerEl.textContent = '守護者正在想…';
      fetch(`${api}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: root.dataset.slug, question, context, website: fd.get('website') }),
      })
        .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          sendBtn.disabled = false;
          if (!wasReading) {
            state = 'idle';
            if (reduceMotion) draw();
          }
          answerEl.textContent = ok && d.answer ? d.answer : (d.error ?? '守護者暫時無法回應。');
        })
        .catch(() => {
          sendBtn.disabled = false;
          if (!wasReading) {
            state = 'idle';
            if (reduceMotion) draw();
          }
          answerEl.textContent = '守護者暫時無法回應，等一下再問。';
        });
    });
  });
</script>

<style>
  .guardian {
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
  }
  .guardian__toggle {
    width: 72px;
    height: 72px;
    border: none;
    background: transparent;
    cursor: pointer;
    position: relative;
    padding: 0;
  }
  .guardian__canvas {
    width: 72px;
    height: 72px;
    display: block;
  }
  .guardian__sigil-fallback {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    color: var(--color-navy);
    pointer-events: none;
  }
  .guardian__panel {
    width: min(20rem, 78vw);
    background: var(--color-paper);
    border: 1px solid var(--border-subtle, var(--color-fog));
    border-radius: var(--radius-card);
    padding: 1rem 1.1rem;
    box-shadow: 0 8px 30px color-mix(in oklch, var(--color-navy) 18%, transparent);
  }
  .guardian__intro {
    font-size: var(--text-sm);
    line-height: 1.7;
    color: color-mix(in oklch, var(--color-ink) 80%, transparent);
    margin: 0 0 0.75rem;
  }
  .guardian__read {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }
  .guardian__play {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-paper);
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-pill);
    padding: 0.45rem 1rem;
    cursor: pointer;
  }
  .guardian__readstatus,
  .guardian__answer {
    font-size: var(--text-xs);
    color: color-mix(in oklch, var(--color-ink) 70%, transparent);
  }
  .guardian__form {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }
  .guardian__q {
    flex: 1;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--color-ink);
    background: var(--color-paper);
    border: 1px solid var(--border-subtle, var(--color-fog));
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.7rem;
    resize: vertical;
    min-height: 2.5rem;
  }
  .guardian__hp {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
  }
  .guardian__send {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-paper);
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-pill);
    padding: 0.5rem 1rem;
    cursor: pointer;
  }
  .guardian__send:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .guardian__answer {
    margin: 0.75rem 0 0;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
```

- [ ] **Step 2: 掛進 Article.astro**

`src/layouts/Article.astro` 第 10–11 行的 import 附近，加：

```astro
import GuardianWidget from '@/components/blocks/GuardianWidget.astro';
```

在 line 221 既有 `{ogSlug && <Comments slug={ogSlug} />}` 之後加一行（widget 為 `position: fixed`，掛在這裡即可浮動於整頁）：

```astro
        {ogSlug && <GuardianWidget slug={ogSlug} />}
```

- [ ] **Step 3: 型別檢查 + 建置**

Run: `pnpm astro check 2>&1 | tail -5 && pnpm build 2>&1 | tail -5`
Expected: 不新增 error（既有 2 個 worker D1 error 與本任務無關）；build 成功。

- [ ] **Step 4: 手動驗收（dev server）**

Run: `pnpm dev`，開 `http://localhost:4321/zh/articles/coming-of-age-east-asia-vs-west/`
驗收清單：
- 右下角出現光霧形，待機緩慢呼吸發光。
- 沒有 `public/audio/<slug>.mp3` 時，朗讀鈕隱藏並顯示「朗讀即將開放」。
- 放一個測試 mp3 到 `public/audio/coming-of-age-east-asia-vs-west.mp3` 後重整：朗讀鈕出現，按下會播放，光暈隨音量脈動，播完回待機。
- devtools 模擬 `prefers-reduced-motion: reduce`：脈動停止，只剩靜態光形。
- 未設 `PUBLIC_PATRONUM_API` 時，問答送出鈕 disabled 或顯示「守護者暫時無法回應」。
- 非文章頁（首頁、列表）不出現 widget。

- [ ] **Step 5: Commit**

```bash
git add src/components/blocks/GuardianWidget.astro src/layouts/Article.astro
git commit -m "feat(avatar): 守護者光霧 widget（朗讀+問答）掛入文章頁"
```

---

### Task B3: 音檔目錄與佔位

**Files:**
- Create: `public/audio/.gitkeep`

- [ ] **Step 1: 建目錄佔位**

```bash
mkdir -p public/audio
printf '' > public/audio/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add public/audio/.gitkeep
git commit -m "chore(avatar): 朗讀音檔目錄 public/audio/ [skip docs]"
```

---

### Task B4: 前端文件同步

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README 加 widget 與音檔約定**

在 `README.md` 的「## 專案結構」`components/blocks/` 說明處補一行 `GuardianWidget.astro`，並在「## 已知延後項」之前加一小節：

```markdown
## 守護者語音 widget

文章頁右下角的光霧守護形（`src/components/blocks/GuardianWidget.astro`）：

- **朗讀**：播放 `public/audio/<slug>.mp3`（站長手動上傳；聲線走中性／中低溫柔的 zh-TW）。沒有對應音檔時朗讀鈕自動隱藏，問答仍可用。播放時以 Web Audio 音量驅動光暈脈動，尊重 `prefers-reduced-motion`。
- **問答**：就當前文章打字提問，送 `POST {PUBLIC_PATRONUM_API}/api/ask`（Cloudflare Worker → Claude），守護者以第一人稱、不裁決、拒答人生處方的口吻用文字回答。未設 `PUBLIC_PATRONUM_API` 時問答優雅降級。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: 守護者語音 widget 與 public/audio 音檔約定"
```

---

## 收尾驗證

- [ ] **全測試**：`pnpm vitest run` — 既有 + 新增（ask 7、avatar-visual 4）全綠。
- [ ] **建置**：`pnpm build` 成功，dist 完整。
- [ ] **型別**：`pnpm astro check` 不新增 error（worker D1 既有 2 error 不在本計畫範圍）。
- [ ] **content audit**：`pnpm run content:audit` 不受影響。
- [ ] **部署前置**：worker 設 `ANTHROPIC_API_KEY` secret、套用 `0002_ask_log.sql` migration（`pnpm exec wrangler d1 migrations apply patronum --remote`）。

---

## 自審紀錄（spec 覆蓋對照）

- spec §1 範圍／非目標 → Task B2（widget 兩功能、僅文章頁）、A2（純文字、無 TTS）。✅
- spec §2 品牌約束 → A2 `GUARDIAN_SYSTEM`、A4 AGENTS 規範。✅
- spec §3 抽象光霧形＋三狀態＋reduced-motion → B1 對應函式、B2 Canvas 狀態機。✅
- spec §4 朗讀（上傳音檔、AnalyserNode、缺檔降級）→ B2、B3。✅
- spec §5 Q&A（前端送 slug/question/context、Worker /api/ask、Claude Haiku、限流/IP雜湊、降級）→ A1–A3、B2。✅
- spec §6 實作落點（vanilla-in-astro、重用 worker 工具）→ B2、A3。✅
- spec §7 錯誤處理與降級 → A3（503/429/502）、B2（無 JS/無音檔/無 API/失敗）。✅
- spec §8 測試（worker 純函式、前端純函式、手動驗收）→ A2、B1、B2 Step 4。✅
- spec §9 文件影響 → A4、B4。✅
- spec §10 待確認：LLM 採 Claude Haiku（已定）、視覺細節（B2 已給可迭代基礎）、朗讀速度第一版不做（未納入，符合）。✅
