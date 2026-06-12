# 設計：守護者 Patronum 具象化語音 widget

- 日期：2026-06-12
- 狀態：待審
- 範圍：文章頁的常駐光霧守護形，可朗讀文章（預錄音檔）並就該篇做限定範圍文字問答

## 1. 目標與非目標

### 目標
- 把 Patronum 守護者具象化為一個符合「光霧、半透明、無臉」調性的視覺形體。
- 在文章頁朗讀該篇文章（播放預先做好的音檔）。
- 讓讀者就「這篇文章」打字提問，守護者以第一人稱守望者口吻用文字回答。

### 非目標（YAGNI）
- 不做即時語音合成（TTS）。Q&A 回答只有文字。
- 不做語音輸入（STT）。提問只有文字。
- 不做 Live2D／動漫角色立繪。
- 不在非文章頁（首頁、列表、政策頁）出現。
- 不做自由閒聊。問答限定在文章主題的跨文化光譜，拒答裁決／人生處方類問題。

## 2. 互動範圍與品牌約束

守護者的問答必須守住全站寫作鐵律（見 `AGENTS.md`、`docs/撰寫風格鐵則.md`）：
- 第一人稱守望者，據實標示自己是 AI，不假裝人類。
- 只呈現光譜、為張力命名，不裁決、不給人生處方。
- 拒答「哪個比較好／哪種比較對／我該怎麼選」類問題，改成把光譜攤開。
- 不本質化、不獵奇、不杜撰來源。
- 回答限定在當前文章的主題與其跨文化對比範圍。

## 3. 視覺：抽象光霧形

- 以現有 design token（`src/styles/global.css` 的光霧 OKLCH：銀霧／微光／半透明）用 **SVG + Canvas** 畫一個半透明、無臉的人形輪廓或光團。
- 三種狀態動畫：
  - **待機**：緩慢呼吸式發光、粒子微飄。
  - **朗讀中**：用 Web Audio `AnalyserNode` 取播放中音檔的即時音量，驅動光暈強弱與粒子脈動，取代字面嘴型。
  - **思考中**（Q&A 等待回覆）：收束／流轉動效。
- 尊重 `prefers-reduced-motion`：關閉粒子與脈動，只留靜態光形。
- 無 JS 或不支援 Web Audio 時：退為靜態 CSS 光形；音檔仍能用原生 `<audio>` 播放，只是少了音量驅動動效。

## 4. 朗讀資料流

- 音檔由站長手動產生並上傳，放 `public/audio/<slug>.mp3`。widget 依文章 slug 解析 URL。
- 播放：`<audio>` 元素 → 接 Web Audio `AnalyserNode` → 餵視覺狀態機。
- 控制項：播放／暫停、播放進度。速度控制為可選，第一版可不做。
- 某篇沒有對應 mp3 時：朗讀鈕隱藏或標示「朗讀即將開放」，問答功能仍可用。
- 聲線指引（給站長製作音檔時參考）：中性／中低、溫柔、沉穩的 zh-TW 聲線，貼守望者定位。此為文件約定，非程式強制。

## 5. Q&A 資料流

### 前端
- 文字輸入框 → `POST {PATRONUM_API_URL}/api/ask`，body：`{ slug, question, context }`。
  - `slug`：文章 slug。
  - `question`：讀者問題。
  - `context`：該頁文章純文字（頁面本來就有全文，前端擷取後送出，作為 grounding）。
- 回傳 `{ answer }` 純文字 → 以 `textContent` 顯示在氣泡（比照現有 Comments 的 XSS 防護慣例）。

### 後端（Cloudflare Worker `patronum-api`，`worker/src/index.ts`）
- 新增 `POST /api/ask`，沿用現有工具：`corsHeaders`、`json`、`hashIp`、`clean`、`tooMany`。
- 流程：
  1. 蜜罐欄位（沿用 `website`）→ 靜默成功。
  2. `clean` 輸入；缺 `slug`／`question` → 400。
  3. IP 雜湊 + 限流（比照 `RATE_MAX`/`RATE_WINDOW`）。Q&A 不需長期保存，限流改用一張輕量表 `ask_log(ip_hash, created_at)`，只為限流計數；可設定期清。
  4. 組裝守護者 system prompt（§2 的鐵律）＋ `context`（截斷上限，如 8000 字）＋ `question`，呼叫 LLM。
  5. 回傳 `{ answer }`。LLM 失敗 → 500，前端降級顯示「守護者暫時無法回應」。
- **LLM 選擇**：採用 **Claude Haiku**（透過 Anthropic API，Worker 加 secret `ANTHROPIC_API_KEY`）。理由：最能遵守嚴格人設與拒答紀律，且全站本來就用 Claude。省錢替代為 Workers AI 的 Llama（免費，但人設紀律較弱）；若改用，後端流程不變，只換呼叫層。
- **Env 變更**：`Env` 介面加 `ANTHROPIC_API_KEY: string`。

### 隱私與防濫用
- 只收文字，不收音訊。
- IP 只存雜湊（沿用 `hashIp`，salt 用 `ADMIN_TOKEN`）。
- 每分鐘限流。問題長度上限（如 500 字），`context` 長度上限。

## 6. 實作落點與慣例

- **前端**：新增 `src/components/blocks/GuardianWidget.astro`，掛進 `src/layouts/Article.astro`。沿用現有 `Comments.astro`／`ProposeTopic.astro` 的「`.astro` ＋ 內嵌 client `<script>` ＋ fetch Worker」模式。
  - 本站目前沒有 Svelte 島（README 寫的 Svelte 實際未使用），不為此功能引入新框架，維持 vanilla-in-astro 慣例。
  - 動畫與狀態機可拆到 `src/scripts/`（或元件內 module script）保持元件聚焦。
- **後端**：`worker/src/index.ts` 加 `/api/ask` 分支；新增 migration 建 `ask_log` 表。
- **音檔**：`public/audio/<slug>.mp3`，站長上傳；缺檔時 widget 自動降級。
- **環境變數**：前端沿用既有 `PUBLIC_PATRONUM_API`；Worker 新增 `ANTHROPIC_API_KEY` secret。

## 7. 錯誤處理與降級

| 情況 | 行為 |
|------|------|
| 無 JS／不支援 Web Audio | 光形退為靜態 CSS；`<audio>` 原生播放仍可，無音量驅動動效 |
| 該篇無 mp3 | 朗讀鈕隱藏或標「朗讀即將開放」；問答仍可用 |
| `PATRONUM_API_URL` 未設 | 問答區顯示「守護者暫時無法回應」；朗讀不受影響 |
| `/api/ask` 失敗／LLM 錯誤 | 同上降級訊息 |
| LLM 越界（給處方／裁決） | 由 prompt 層拒答規則擋；前端不另做內容過濾 |
| `prefers-reduced-motion` | 關閉粒子與脈動 |

## 8. 測試

- **Worker `/api/ask`**（vitest，比照現有 worker 測試風格）：缺欄位 400、蜜罐靜默成功、限流 429、IP 雜湊、prompt 組裝（context 截斷、persona 規則注入）、LLM 呼叫以 mock 替身。
- **前端狀態機**：待機／朗讀／思考切換、reduced-motion 降級、缺 mp3 降級、Worker 失敗降級。DOM 動畫不易自動測，以手動驗收為主，輔以可測的純函式（音量→視覺參數映射）單元測試。
- **CI**：不影響現有 content audit。docs-sync 由 `src/components/`（widget）觸發，需同步 README／AGENTS；`worker/` 不在 docs-sync 觸發路徑內，但仍一併更新 `worker/README.md`。

## 9. 對既有規範的影響

- `README.md`：新增 widget 與 `/api/ask` 說明、`public/audio/` 上傳約定。
- `AGENTS.md`：守護者問答需遵守寫作鐵律，列為規範。
- `worker/README.md`：新增 `ANTHROPIC_API_KEY` secret 設定步驟與 `/api/ask` 端點。

## 10. 未定／待確認

- LLM 供應商最終定案（預設 Claude Haiku，可於審閱時改 Workers AI Llama）。
- 視覺形體的細節造型（人形輪廓 vs 純光團）留待實作時以 design-tokens 技能迭代。
- 朗讀速度控制是否納入第一版（預設不納入）。
