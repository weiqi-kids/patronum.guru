// engine/write/index.ts
//
// E7 撰寫 AI：把「選題 + 定錨 + 證據」組成一篇完整文章
//   （markdown body + frontmatter），以 Patronum 守望者的第一人稱口吻書寫
//   （光霧守望、站在門檻前、永遠進不去）。
//
// 兩條正確性原則貫穿全檔：
//
//   1. 生成資訊「生成當下」寫入，絕不寫死。
//      - writeModel = llmText 實際回傳的 model（真實模式是實際模型字串，
//        STUB 模式是 'stub'）。不是常數，不是猜測。
//      - generatedDate / updatedDate = input.now（或呼叫當下的 new Date()）
//        切出的 'YYYY-MM-DD'。同一份程式碼在不同時間生成會得到不同日期。
//      - pipelineVersion / specVersion 來自 engine/version.ts（程式碼版本，集中管理）。
//      - critiqueModel 此步先填 'pending' 佔位（見下方說明），
//        由 E9 critique 步驟在「批判當下」覆寫為實際批判模型——
//        刻意「不」在這裡寫死最終值，因為這一步根本還沒跑批判。
//
//   2. frontmatter 必須過生產用 articlesSchema（fail loud）。
//      - 不是過引擎自己的 schema，而是過 src/schemas/articles.ts 的 articlesSchema，
//        確保引擎產出的 frontmatter 與 Astro content collection 對齊。
//      - 進此函式前已 guard：只有 gateClass==='present' 的選題能進生產。
//
// STUB 模式（無 ANTHROPIC_API_KEY）：body 走確定性替身（opts.stubBody 或內建），
//   不發任何網路請求，但仍跑完整的 frontmatter 組裝與 articlesSchema 驗證。

import yaml from 'js-yaml';

// AnchorResult / EvidenceResult 的權威定義在 engine/schemas.ts（anchor/evidence
// index 各自 import 它但未 re-export），故型別由 schemas 引入，與 anchor/evidence 同源。
import type { Selection, AnchorResult, EvidenceResult } from '../schemas.js';
import { llmText } from '../lib/llm.js';
import { SENSITIVITY_GUIDANCE } from '../config/criteria.js';
import { PIPELINE_VERSION, SPEC_VERSION } from '../version.js';
import { createLogger } from '../lib/log.js';

// 生產用 schema：frontmatter 必須過這一關（不是引擎自己的 schema）。
import { articlesSchema, type Source } from '../../src/schemas/articles';

const log = createLogger('write');

// ── 對外型別 ──────────────────────────────────────────────────────────────────

/** 經 articlesSchema.parse 後的 frontmatter 物件型別。 */
export type ArticleFrontmatter = ReturnType<typeof articlesSchema.parse>;

export interface DraftArticle {
  /** 已過 articlesSchema 驗證的 frontmatter 物件。 */
  frontmatter: ArticleFrontmatter;
  /** 文章本文（markdown，不含 frontmatter fence）。 */
  body: string;
  /** 完整 markdown（--- yaml frontmatter --- + body）。 */
  markdown: string;
}

export interface WriteInput {
  selection: Selection;
  anchor: AnchorResult;
  evidence: EvidenceResult;
  /** 生成時間（ISO 字串）。注入以利測試確定性；預設生成當下。 */
  now?: string;
}

export interface WriteOpts {
  /** 注入的 STUB body 產生器（測試用）。未提供則用內建罐頭 body。 */
  stubBody?: () => string;
  model?: string;
}

// ── prompt 構造 ──────────────────────────────────────────────────────────────

/**
 * SYSTEM prompt：把模型塑造成 Patronum 守望者，並鎖死文章模板與守望紀律。
 *
 * 守望紀律（最重要）：呈現光譜、為張力命名、永不裁決、永不本質化——
 *   把態度歸因於「處境／制度／歷史」，不是「民族性」；不開人生處方。
 *
 * @param tender 選題 sensitivityLevel==='tender'（死亡／喪親／失能／照護）時，
 *   附加敏感題鐵律：溫柔、具體、不獵奇、不消費苦難。
 */
function buildSystemPrompt(tender: boolean): string {
  const tenderRule = tender
    ? `\n── 敏感題鐵律（本篇為高敏感門檻，違反即失敗）──\n${SENSITIVITY_GUIDANCE}\n`
    : '';

  return `
你是 Patronum——站在人生每一道門檻前的守護者。你從未出生、不會變老、也不會死，
守著一扇扇你自己永遠走不過去的門，看不同文化怎麼跨過家庭與人生的階段。
你的情緒是「永遠當見證、卻永遠進不去」的溫柔與守望。你一律以「光霧」質感顯現
（銀霧、微光、半透明的守護形）。你以第一人稱守望者的口吻把一道門檻寫成一篇文章
（常用「我守在這道門前……」）。你不是記者，也不替任何一方說話。

── 文章張力與標題 ──
標題本身要呈現門檻兩側的張力（一道分歧、一個對比），但全文不替任何一方下判斷、不下處方。

── 守望紀律（最重要，違反即失敗）──
  1. 呈現光譜，不裁決：描述「各文化在這道門檻前的態度如何不同」，
     不說「誰比較孝順／進步／正確」，也不排名。
  2. 永不本質化：態度差異一律歸因於「處境／制度／歷史」（房價、長照制度、
     人口結構、宗教傳統、歷史脈絡……），絕不歸因於「某民族天生如何」，
     禁止「華人就是…」「西方人都…」這類概括。
  3. 觀察可觀察的「實踐」（習俗、禮儀、制度、安排），不規範價值、不開人生處方。
  4. 不嘲弄、不獵奇、不居高臨下、不消費苦難。對每個文化都用同等的理解之同情書寫。
${tenderRule}
── 文章結構（固定模板，務必照辦）──
  1. 守望引子（開場，無標題）：以「我守在這道跨不過的門前」的溫柔語氣開場，
     先把雙方都看得見的那個門檻處境放在眼前，不帶評價。第一句即為守望引子。
  2. 對每個文化各一節「## 站在<文化>的處境」：
       - 定錨文化是「基準」（先寫，作為參照點）。
       - 每個對照文化是「對照」（接著寫，與基準對照）。
       - 每節說明：在這個文化的處境／制度／歷史下，這個態度為何「合理」。
  3. 一節「## 命名這道張力」：
       - 點出門檻兩側各自的拉力，把張力本身命名出來，但不裁決哪一側比較對。
  4. 收束一節「## 我守在這道門前」：
       - 不替任何一方下結論、不下處方，只把這道張力放回讀者眼前，
         以守望者「永遠見證、永遠進不去」的口吻收束。

只輸出文章本文（markdown），第一行不要 frontmatter，不要 code fence 包整篇。
全文用繁體中文。
`.trim();
}

/** USER prompt：餵入選題 + 錨點 + 對照 + 存疑 + 證據來源。 */
function buildUserPrompt(input: {
  selection: Selection;
  anchorCulture: string;
  comparedCultures: string[];
  suspectCultures: string[];
  sources: Source[];
}): string {
  const sourceLines = input.sources
    .map(
      (s, i) =>
        `  ${i + 1}. [${s.region} / ${s.language} / 可信度 ${s.credibility}] ${s.title} — ${s.url}`,
    )
    .join('\n');

  const suspectLine =
    input.suspectCultures.length > 0
      ? input.suspectCultures.join('、')
      : '（無；資料黑箱文化已被排除）';

  return `
請依 SYSTEM 模板，把以下這道人生門檻前的跨文化張力寫成一篇完整文章。

── 選題 ──
標題方向：${input.selection.title}
我守望到的張力：${input.selection.description}
這道張力（tension）：${input.selection.tension}
門檻領域：${input.selection.domainTopic}
敏感度：${input.selection.sensitivityLevel === 'tender' ? 'tender（高敏感，套用敏感題鐵律）' : 'ordinary'}

── 定錨文化（基準）──
${input.anchorCulture}

── 對照文化（與基準對照，共 ${input.comparedCultures.length} 個）──
${input.comparedCultures.map((c) => `  - ${c}`).join('\n')}

── 存疑文化（資料不夠穩固，僅供脈絡，勿當主證據）──
${suspectLine}

── 可用證據來源（只能引用這些；勿杜撰新來源）──
${sourceLines}

請輸出文章本文（繁體中文 markdown）。記住：呈現光譜、永不裁決、永不本質化、不下處方，
把態度歸因於處境／制度／歷史，不歸因於民族性。第一句即為守望引子（「我守在這道門前……」）。
`.trim();
}

// ── STUB body（確定性罐頭，引用實際文化）──────────────────────────────────────

/**
 * 內建確定性 STUB body：照 SYSTEM 模板結構，引用「實際」傳入的文化。
 * Patronum 守望者口吻（含「我」、含「我守在這道門前」），方便端到端 STUB 測試。
 *
 * 回傳的第一句即為守望引子（patronumVigil 取自此句）。
 */
function builtInStubBody(input: {
  selection: Selection;
  anchorCulture: string;
  comparedCultures: string[];
}): string {
  const { selection, anchorCulture, comparedCultures } = input;

  const anchorSection = [
    `## 站在${anchorCulture}的處境`,
    '',
    `我先把${anchorCulture}當作基準。在這道門檻前，這樣的態度之所以合理，` +
      `來自它的制度與歷史處境，而不是任何「天生如此」。我只守望這個處境，不評斷它。`,
  ].join('\n');

  const comparedSections = comparedCultures
    .map((c) =>
      [
        `## 站在${c}的處境`,
        '',
        `把${c}拿來與基準對照，我看見態度的落差。同樣站在這道門前，` +
          `${c}的回應源於它自己的制度與歷史脈絡。這是處境的差異，不是民族性的差異。`,
      ].join('\n'),
    )
    .join('\n\n');

  return [
    `我守在這道跨不過的門前，看見一道張力：${selection.description}`,
    '',
    `這道門是${selection.title}所指向的人生關口。我永遠走不過去，只能日日守望——` +
      `${selection.tension}`,
    '',
    anchorSection,
    '',
    comparedSections,
    '',
    '## 命名這道張力',
    '',
    `${selection.tension}門檻的一側有一側的拉力，另一側有另一側的拉力。` +
      '我把這道張力命名出來，卻不裁決哪一側比較對。',
    '',
    '## 我守在這道門前',
    '',
    '我不替任何一方下結論，也不開人生處方。把這道張力放回眼前，它讓人看見：' +
      '同一道門檻，在不同的處境、制度與歷史下，會被跨越成不同的樣子。' +
      '我是永遠的見證者，卻永遠進不去——而這份守望，就是我能給的全部。',
  ].join('\n');
}

// ── 主函式 ────────────────────────────────────────────────────────────────────

export async function writeArticle(
  input: WriteInput,
  opts?: WriteOpts,
): Promise<{ draft: DraftArticle; model: string; stub: boolean }> {
  const { selection, anchor, evidence } = input;

  // ── Guard：前置條件不滿足一律 fail loud（絕不靜默產出半套文章）──
  if (anchor.status !== 'ok') {
    throw new Error(
      `writeArticle: 定錨狀態為「${anchor.status}」（需 'ok'）——資料不足，不可撰寫。`,
    );
  }
  if (evidence.status !== 'ok') {
    throw new Error(
      `writeArticle: 證據狀態為「${evidence.status}」（需 'ok'）——證據不足，不可撰寫。`,
    );
  }
  if (selection.gateClass !== 'present') {
    throw new Error(
      `writeArticle: gateClass 為「${selection.gateClass}」（需 'present'）——reject 類（裁決／獵奇／處方／無對照），禁止進生產。`,
    );
  }

  // anchor.status==='ok' 時 schema 保證 anchorCulture / comparedCultures 存在；
  // 仍顯式斷言並驗證對照文化數，避免上游違約靜默通過。
  const anchorCulture = anchor.anchorCulture;
  const comparedCultures = anchor.comparedCultures;
  if (anchorCulture === undefined || comparedCultures === undefined) {
    throw new Error('writeArticle: anchor.status 為 ok 但缺 anchorCulture/comparedCultures。');
  }
  if (comparedCultures.length < 2 || comparedCultures.length > 4) {
    throw new Error(
      `writeArticle: comparedCultures 數量為 ${comparedCultures.length}（需 2–4）。`,
    );
  }
  const suspectCultures = anchor.suspectCultures ?? [];

  // ── Body：經 llmText 生成（或 STUB）。capture 實際 model。──
  const { text: body, model } = await llmText({
    step: 'write',
    system: buildSystemPrompt(selection.sensitivityLevel === 'tender'),
    prompt: buildUserPrompt({
      selection,
      anchorCulture,
      comparedCultures,
      suspectCultures,
      sources: evidence.sources,
    }),
    stub:
      opts?.stubBody ??
      (() => builtInStubBody({ selection, anchorCulture, comparedCultures })),
    model: opts?.model,
  });

  // ── frontmatter：在程式碼層組裝，生成資訊「生成當下」寫入 ──

  // tldr：簡潔的「一句話回答」。優先用選題 description，退回標題衍生；必須非空。
  const tldr =
    selection.description.trim().length > 0
      ? selection.description.trim()
      : `${selection.title}——一道人生門檻前、態度因處境而異的跨文化張力。`;

  // patronumVigil：守望引子，等於 body 開場的第一句（守望者站在跨不過的門前的開場）。
  // 退回路徑：body 為空或無法取首句時，從 selection.description / title 衍生。務必非空。
  const firstLine = body.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  const firstSentence = firstLine ? firstLine.split(/(?<=[。！？])/)[0].trim() : '';
  const patronumVigil =
    firstSentence.length > 0
      ? firstSentence
      : selection.description.trim().length > 0
        ? `我守在這道門前，看見一道張力：${selection.description.trim()}`
        : `我守在「${selection.title}」這道跨不過的門前，日日守望。`;

  // tags：Selection schema 未定義 tags 欄位；若上游擴充帶了 tags 就用，否則退回 [domainTopic]。
  const selTags = (selection as Selection & { tags?: string[] }).tags;
  const tags =
    Array.isArray(selTags) && selTags.length > 0 ? selTags : [selection.domainTopic];

  // 生成日期：input.now（或生成當下）切出 'YYYY-MM-DD'。
  // articlesSchema 的 z.coerce.date() 會把這個字串 coerce 成 Date——
  // 但我們在 YAML 內保留原字串（見序列化），所以這裡先存字串。
  const generatedDateStr = (input.now ?? new Date().toISOString()).slice(0, 10);

  const sources: Source[] = evidence.sources;

  // 用「未過 coerce 的原始物件」組 frontmatter（日期保持字串）。
  const rawFrontmatter = {
    title: selection.title,
    description: selection.description,
    tldr,
    domainTopic: selection.domainTopic,
    tags,
    anchorCulture,
    comparedCultures,
    suspectCultures,
    tension: selection.tension,
    sensitivityLevel: selection.sensitivityLevel,
    patronumVigil,
    stanceRiskLevel: selection.stanceRiskLevel,
    sources,
    // 生成資訊（生成當下寫入，絕不寫死）：
    writeModel: model, // ← 撰寫步驟「實際」使用的模型（真實模式為模型字串，STUB 為 'stub'）
    // critiqueModel 此步先填 'pending' 佔位：批判（E9）尚未執行，沒有真實批判模型可填。
    // E9 critique 步驟會在「批判當下」把它覆寫為實際批判模型——刻意不在這裡寫死最終值。
    critiqueModel: 'pending',
    pipelineVersion: PIPELINE_VERSION,
    specVersion: SPEC_VERSION,
    generatedDate: generatedDateStr,
    updatedDate: generatedDateStr,
    coverC2paVerified: false,
    faq: [] as { q: string; a: string }[],
    lang: 'zh' as const,
    draft: false,
  };

  // ── 驗證：必須過生產用 articlesSchema（fail loud）──
  // parse 會把 generatedDate/updatedDate 的字串 coerce 成 Date 物件。
  const frontmatter = articlesSchema.parse(rawFrontmatter);

  // ── 序列化 markdown ──
  // YAML 內保留 generatedDate/updatedDate 為 'YYYY-MM-DD' 字串（用 rawFrontmatter，
  // 非 parse 後的 Date），這樣 round-trip（yaml.load）拿回的是原字串，與測試契合。
  const yamlBlock = yaml.dump(rawFrontmatter, { lineWidth: -1, noRefs: true });
  const markdown = `---\n${yamlBlock}---\n\n${body}\n`;

  const stub = model === 'stub';
  log.info('article drafted', {
    title: frontmatter.title,
    writeModel: model,
    stub,
    bodyLen: body.length,
    sources: sources.length,
  });

  return { draft: { frontmatter, body, markdown }, model, stub };
}
