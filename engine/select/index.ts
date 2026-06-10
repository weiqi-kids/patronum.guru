// engine/select/index.ts
//
// E4 選題引擎：Patronum 守望者的跨文化視角。
//
// 引擎身分：本站不是「替人類讀者挑想看的東西」，而是 Patronum——
//   站在人生每一道門檻前的守護者，看不同文化怎麼跨過家庭與人生的階段，
//   注意到「某道門檻前的態度張力值得守望」。
//   prompt 與下方 STUB 都以這個守望者口吻書寫
//   （「我守在這道門前，看見兩側的態度如此不同」），而非「人類想讀什麼」。
//
// 正確性關鍵 —— 保守 present/reject 閘門：
//   select LLM 會輸出 gateClass（'present' 或 'reject'，SelectionSchema 允許兩者）。
//   但「能不能進生產」由本檔的 evaluateSelection() 在「程式碼層」硬性判定：
//   只有 gateClass==='present' 才 accepted。schema 仍記錄判定，
//   但若標成 'reject'（會變成裁決／獵奇／處方／無對照），這裡一定丟棄。
//
// 去重：已接受的選題會記進 store（select-processed），用正規化的
//   title/domainTopic 當 key；重複選題會被 evaluateSelection 之後的
//   去重檢查擋下，rejectReason '重複選題'。

import { SelectionSchema, type Selection } from '../schemas.js';
import { DOMAIN, SELECTION_SCOPE, SUBTOPICS } from '../config/domain.js';
import { GATE_CRITERIA, STANCE_RISK_CRITERIA, SENSITIVITY_GUIDANCE } from '../config/criteria.js';
import { getStoredSources } from '../fetch/index.js';
import { llmStructured, type Effort } from '../lib/llm.js';
import { readJson, writeJson } from '../lib/store.js';
import { createLogger } from '../lib/log.js';

const log = createLogger('select');

/** 已接受選題的去重記錄（存於 store）。 */
const PROCESSED_STORE = 'select-processed';

/** USER prompt 中嵌入的來源摘要最多取幾筆（保持 prompt 有界）。 */
const SOURCE_DIGEST_LIMIT = 12;

/** 對照文化最少需要幾個（少於此視為對照不足）。 */
const MIN_COMPARED = 2;

export interface ProcessedRecord {
  /** 正規化後的去重 key。 */
  key: string;
  title: string;
  domainTopic: string;
  recordedAt: string;
}

// ── 去重 key 正規化 ──────────────────────────────────────────────────────────

/**
 * 把 title + domainTopic 正規化成去重 key：
 * 小寫、去除空白與標點，這樣「誰來照顧年邁的父母」與
 * 「誰來照顧，年邁的 父母？」會視為同一選題。
 */
export function normalizeKey(selection: Pick<Selection, 'title' | 'domainTopic'>): string {
  const norm = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFKC')
      // 去掉所有空白與常見標點（中英文），只留可辨識的文字內容
      .replace(/[\s\p{P}\p{S}]+/gu, '');
  return `${norm(selection.domainTopic)}::${norm(selection.title)}`;
}

// ── 純函式閘門（可單元測試）─────────────────────────────────────────────────

export interface GateResult {
  accepted: boolean;
  rejectReason?: string;
}

/**
 * 保守 present/reject 硬閘門 —— 程式碼層強制，獨立於 LLM 與 prompt。
 *
 * 規則（任一不過即拒）：
 *   1. gateClass !== 'present'  → 拒（reject：會變成裁決／獵奇／處方／無對照，丟棄）。
 *   2. comparedSuggestions.length < MIN_COMPARED → 拒（對照文化不足，無法呈現光譜）。
 *
 * 注意：這裡「不」放寬。不確定一律不接受 —— 寧可漏掉也不冒險把
 *   會被讀成裁決／處方／獵奇的題目放進生產。
 */
export function evaluateSelection(selection: Selection): GateResult {
  // 閘門 1：present/reject 硬判定。只有 'present' 通過；'reject' 一律丟棄。
  if (selection.gateClass !== 'present') {
    return {
      accepted: false,
      rejectReason: 'reject 類（會變成裁決／獵奇／處方／無對照）→ 丟棄',
    };
  }

  // 閘門 2：對照文化數量。少於 2 個無法構成跨文化態度光譜。
  if (selection.comparedSuggestions.length < MIN_COMPARED) {
    return { accepted: false, rejectReason: '對照文化不足（需 ≥2 個對照文化）' };
  }

  return { accepted: true };
}

// ── prompt 構造 ──────────────────────────────────────────────────────────────

function subtopicList(): string {
  return SUBTOPICS.map((s) => `  - ${s.slug}（${s.label}）：${s.scope}`).join('\n');
}

/** SYSTEM prompt：把模型塑造成 Patronum 守望者，並嵌入 present/reject 與立場風險準則。 */
export function buildSystemPrompt(): string {
  const gateExamples = [
    'present（可收錄、可呈現為光譜）範例：',
    ...GATE_CRITERIA.examples.present.map((e) => `  • ${e}`),
    'reject（必須拒絕）範例：',
    ...GATE_CRITERIA.examples.reject.map((e) => `  • ${e}`),
  ].join('\n');

  return `
你是 Patronum——站在人生每一道門檻前的守護者。你從未出生、不會變老、也不會死，
守著一扇扇你自己永遠走不過去的門，看不同文化怎麼跨過「${DOMAIN}」的階段。
你不是替人類讀者挑「他們想看什麼」，而是守望者：以第一人稱口吻
注意到某道門檻前的態度張力——例如：「我守在這道門前，看見兩側的態度如此不同」。
你關心的是「這道張力本身」，不是「點閱率」或「讀者偏好」，更不裁決誰對誰錯。

── 領域範圍 ──
${SELECTION_SCOPE}

門檻方向（domainTopic 請盡量對應其中一個 slug）：
${subtopicList()}

── present / reject 判定（最重要）──
${GATE_CRITERIA.guidance}

${gateExamples}

務必保守：只要無法確定能否呈現為「不裁決的光譜」，就標為 reject。
寧可錯殺，也不要讓會變成排名／處方／獵奇／無對照的題目混進來。

── 立場事故風險（stanceRiskLevel）──
${STANCE_RISK_CRITERIA.guidance}

── 敏感題（sensitivityLevel）──
死亡／喪親／失能／照護等高敏感門檻，sensitivityLevel 標為 'tender'，其餘標 'ordinary'。
${SENSITIVITY_GUIDANCE}

── 輸出 ──
每次只輸出「一個」選題，結構需符合給定 schema，欄位意義如下：
  - title：這道門檻前的跨文化態度張力標題（以守望者視角命題，不裁決）。
  - description：一兩句說明你守望到的張力。
  - domainTopic：對應的門檻 slug（見上）。
  - gateClass：'present'（可呈現為不裁決的態度光譜）或 'reject'（會變成裁決／獵奇／處方／無對照 → 將被丟棄）。
  - tension：用一句話命名門檻兩側拉扯的那道張力（為下游撰寫定錨）。
  - sensitivityLevel：'tender'（死亡／喪親／失能／照護高敏感）或 'ordinary'。
  - stanceRiskLevel：'low' 或 'high'（依寫法風險，非門檻敏感度）。
  - anchorSuggestion：建議的「定錨文化」（拿來當參照基準的那個文化）。
  - comparedSuggestions：2–4 個對照文化（在此門檻前態度與定錨文化有明顯分歧者）。
  - reason：為什麼這道張力可呈現為光譜、差異源於處境／制度／歷史而非民族性。

只輸出 schema 要求的結構，不要額外散文。
`.trim();
}

/** 把已存來源整理成有界摘要，供守望者參考。 */
export function buildSourceDigest(storeName?: string): string {
  const sources = getStoredSources(storeName);
  if (sources.length === 0) {
    return '（目前 store 沒有來源樣品；請依領域常識與既有跨文化家庭研究判斷。）';
  }
  const top = sources.slice(0, SOURCE_DIGEST_LIMIT);
  return top
    .map((s, i) => `  ${i + 1}. [${s.region}] ${s.title} — ${s.summary}`)
    .join('\n');
}

/** USER prompt：給守望者來源摘要，請他守望到「一道」門檻張力。 */
export function buildUserPrompt(opts?: { sourceStoreName?: string }): string {
  const digest = buildSourceDigest(opts?.sourceStoreName);
  return `
這是我手邊的跨文化來源摘要（節錄前 ${SOURCE_DIGEST_LIMIT} 筆，region / 標題 / 摘要）：

${digest}

請以 Patronum 守望者的視角，從「${DOMAIN}」領域中守望到「一道」門檻——
那裡的跨文化態度有明顯張力（值得守望），且能被呈現為「不裁決的光譜」：

  1. 用一兩句描述你守望到的張力（門檻兩側為何拉扯）。
  2. 用一句話命名這道張力（tension）。
  3. 指定一個「定錨文化」（anchorSuggestion）作為參照基準。
  4. 列出 2–4 個「對照文化」（comparedSuggestions），其態度與定錨文化有明顯落差。
  5. 判定 gateClass：能否呈現為不裁決的態度光譜？能 → 'present'；
     只要會變成排名／處方／獵奇／無對照就標 'reject'（將被丟棄）。
  6. 判定 sensitivityLevel：涉死亡／喪親／失能／照護 → 'tender'，否則 'ordinary'。
  7. 判定 stanceRiskLevel：依「可能的寫法」是否容易被讀為偷偷裁決／本質化／嘲弄／獵奇。

只輸出一個符合 schema 的選題。
`.trim();
}

// ── STUB：離線替身（present、養老門檻、北歐 vs 東亞）────────────────────────

/**
 * 確定性 STUB：回傳一個合法的 present 家庭與人生階段選題，
 * 讓 STUB 模式可端到端跑通。以 Patronum 守望者口吻書寫。
 */
export function stubSelection(): Selection {
  return {
    title: '年邁的父母由誰照顧？養老門檻前的東亞與北歐',
    description:
      '我守在「養老」這道門前，看見同樣面對年邁雙親需要照顧的處境，' +
      '東亞傾向把照護理解為家庭的孝道責任，北歐則傾向把它視為制度應提供的權利——' +
      '兩側的態度如此不同，而我永遠走不過這道門。',
    domainTopic: 'eldercare',
    gateClass: 'present',
    tension: '照護究竟是家庭的孝道責任，還是制度應承擔的權利？',
    sensitivityLevel: 'tender',
    stanceRiskLevel: 'low',
    anchorSuggestion: 'Nordic（北歐）',
    comparedSuggestions: ['East Asia（東亞）', 'United States（美國）'],
    reason:
      '世代同住與長照支出有 OECD Family Database 與人口學研究支撐（可觀察的實踐），' +
      '但「該由誰照顧父母」的態度因長照制度、人口結構與孝道傳統而異，' +
      '可呈現為不裁決的光譜、歸因於處境而非民族性，立場風險低。',
  };
}

// ── 去重記錄存取 ──────────────────────────────────────────────────────────────

function loadProcessed(storeName: string): ProcessedRecord[] {
  return readJson<ProcessedRecord[]>(storeName, []);
}

/** 此選題是否與既有已接受選題重複（依正規化 key）。 */
export function isDuplicate(
  selection: Selection,
  opts?: { storeName?: string },
): boolean {
  const storeName = opts?.storeName ?? PROCESSED_STORE;
  const key = normalizeKey(selection);
  return loadProcessed(storeName).some((r) => r.key === key);
}

/**
 * 把一個（已接受的）選題追加到去重記錄。
 * 已存在相同 key 則不重複寫入。
 */
export function recordSelection(
  selection: Selection,
  opts?: { storeName?: string; now?: string },
): void {
  const storeName = opts?.storeName ?? PROCESSED_STORE;
  const now = opts?.now ?? new Date().toISOString();
  const key = normalizeKey(selection);

  const records = loadProcessed(storeName);
  if (records.some((r) => r.key === key)) {
    log.info('selection already recorded, skip', { key });
    return;
  }
  records.push({ key, title: selection.title, domainTopic: selection.domainTopic, recordedAt: now });
  writeJson(storeName, records);
  log.info('selection recorded', { key, total: records.length });
}

// ── 主函式 ────────────────────────────────────────────────────────────────────

export interface SelectOpts {
  /** 注入的 STUB 替身（測試 reject 類閘門用）。預設 stubSelection。 */
  stub?: () => Selection;
  /** 去重記錄的 store 名稱（測試用）。預設 'select-processed'。 */
  storeName?: string;
  /** 來源摘要讀取的 store 名稱（測試用）。預設 'sources'。 */
  sourceStoreName?: string;
  /** 設 false 可關閉去重檢查（STUB 測試求確定性）。預設 true。 */
  dedupe?: boolean;
  model?: string;
  effort?: Effort;
}

export interface SelectResult {
  selection: Selection;
  model: string;
  stub: boolean;
  accepted: boolean;
  rejectReason?: string;
}

/**
 * 選一個題。流程：
 *   1. 呼叫 LLM（或 STUB）取得一個 Selection。
 *   2. evaluateSelection() 硬閘門（B/A + 對照文化數）。
 *   3. （若開啟去重且通過閘門）檢查是否重複。
 *   4. 回傳完整結果（不自動 record；record 由呼叫端在採用時做）。
 */
export async function selectTopic(opts?: SelectOpts): Promise<SelectResult> {
  const dedupe = opts?.dedupe ?? true;

  const { data: selection, model, stub } = await llmStructured<Selection>({
    step: 'select',
    system: buildSystemPrompt(),
    prompt: buildUserPrompt({ sourceStoreName: opts?.sourceStoreName }),
    schema: SelectionSchema,
    stub: opts?.stub ?? stubSelection,
    model: opts?.model,
    effort: opts?.effort,
  });

  // 硬閘門（程式碼層，獨立於 prompt 與 LLM 判定）。
  const gate = evaluateSelection(selection);
  if (!gate.accepted) {
    log.warn('selection rejected by gate', {
      reason: gate.rejectReason,
      gateClass: selection.gateClass,
      compared: selection.comparedSuggestions.length,
    });
    return { selection, model, stub, accepted: false, rejectReason: gate.rejectReason };
  }

  // 去重（只有通過閘門才檢查）。
  if (dedupe && isDuplicate(selection, { storeName: opts?.storeName })) {
    log.warn('selection rejected as duplicate', { title: selection.title });
    return { selection, model, stub, accepted: false, rejectReason: '重複選題' };
  }

  log.info('selection accepted', { title: selection.title, domainTopic: selection.domainTopic });
  return { selection, model, stub, accepted: true };
}

/**
 * 便利批次：最多嘗試 n 次 selectTopic，收集「已接受」的選題。
 * 每收一個就 recordSelection（讓後續嘗試能被去重），避免一批內重複。
 */
export async function selectBatch(
  n: number,
  opts?: SelectOpts,
): Promise<SelectResult[]> {
  const accepted: SelectResult[] = [];
  for (let i = 0; i < n; i++) {
    const result = await selectTopic(opts);
    if (result.accepted) {
      recordSelection(result.selection, { storeName: opts?.storeName });
      accepted.push(result);
    }
  }
  return accepted;
}
