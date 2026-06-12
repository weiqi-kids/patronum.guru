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

// 去控制字元、trim、截斷。獨立放這裡以利純測試。
// 邏輯與 worker/src/index.ts 的 clean() 等價：保留 \t(0x09)\n(0x0A)\r(0x0D)，
// 去掉其餘 C0 控制字元（0x00–0x08,0x0B,0x0C,0x0E–0x1F）與 DEL(0x7F)。
// index.ts 用 regex [ --]，這裡改用 codePoint 過濾，避免在原始碼中嵌入字面控制字元。
function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  const stripped = Array.from(s)
    .filter((ch) => {
      const c = ch.codePointAt(0) as number;
      // 保留 \t(0x09)\n(0x0A)\r(0x0D)；去掉其餘 C0 控制字元（0x00–0x08,0x0B,0x0C,0x0E–0x1F）與 DEL(0x7F)。
      // 與 worker/src/index.ts 的 clean() regex 等價。
      return c === 0x09 || c === 0x0a || c === 0x0d || (c > 0x1f && c !== 0x7f);
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
  if (!question) return { kind: 'bad', error: '想問什麼呢？' };
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
