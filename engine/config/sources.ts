// 來源白名單設定。
//
// access 欄位說明：
//   'real'  = 有穩定的公開 API 或可程式化下載的資料集（E3 fetch 可接）。
//   'stub'  = 目前無程式化存取路徑，E3 會以 stub 替代；TODO 標示待補。
//
// 重要：一般性論壇（Reddit、PTT、Dcard、微博⋯⋯）因 ToS／著作權疑慮一律排除（spec §10.5）。
// 本白名單只收錄調查機構、人口／統計機構、民族誌與人口學學術資料庫、或已授權的多語語料庫，
// 聚焦「家庭與人生階段」的跨文化態度與實踐研究。

export interface SourceWhitelistEntry {
  /** 唯一識別碼，英文 kebab-case。 */
  id: string;
  /** 顯示名稱。 */
  name: string;
  /** 資料性質。 */
  kind: 'survey' | 'stats-office' | 'academic' | 'discourse';
  /** 覆蓋地區代碼或名稱（例如 'TW', 'JP', 'global', 'OECD'）。 */
  regions: string[];
  /** 資料語言（ISO 639-1 或 'multi'）。 */
  languages: string[];
  /** 來源可信度。 */
  credibility: 'high' | 'medium' | 'low';
  /**
   * 程式化存取成熟度：
   *   'real'  = 有穩定 API / 資料集下載，E3 可直接對接。
   *   'stub'  = 尚無程式化路徑，E3 以 stub 替代。
   */
  access: 'real' | 'stub';
  /** 官方入口網址（供人工查閱）。 */
  url?: string;
  /** 補充說明或 TODO。 */
  notes?: string;
}

export const SOURCE_WHITELIST: SourceWhitelistEntry[] = [
  // ── 調查機構 ────────────────────────────────────────────────────────────────
  {
    id: 'pew-research',
    name: 'Pew Research Center',
    kind: 'survey',
    regions: ['global'],
    languages: ['en'],
    credibility: 'high',
    access: 'real',
    url: 'https://www.pewresearch.org/topic/family-relationships/',
    notes:
      '提供公開可下載的調查微資料（需免費註冊）；Family & Relationships 主題涵蓋成家、'
      + '同住、養老、世代責任等跨文化態度，家庭與人生階段的核心調查來源。',
  },
  {
    id: 'world-values-survey',
    name: 'World Values Survey (WVS)',
    kind: 'survey',
    regions: ['global'],
    languages: ['multi'],
    credibility: 'high',
    access: 'real',
    url: 'https://www.worldvaluessurvey.org/WVSDocumentationWV7.jsp',
    notes:
      'Wave 7 資料集可直接下載（CSV/SPSS/R）；涵蓋家庭重要性、孝道義務、'
      + '對父母的責任、婚姻與生育態度等題組，跨文化家庭價值分析的核心來源。',
  },

  // ── 統計／人口機構 ────────────────────────────────────────────────────────────
  {
    id: 'oecd-family',
    name: 'OECD Family Database',
    kind: 'stats-office',
    regions: ['OECD'],
    languages: ['en'],
    credibility: 'high',
    access: 'real',
    url: 'https://www.oecd.org/els/family/database.htm',
    notes:
      'OECD Family Database 提供結婚率、離婚率、同住安排、長照支出、'
      + '世代同住比例等指標，多以可下載表格／API 提供，家庭結構跨國比較的權威來源。',
  },
  {
    id: 'un-desa-population',
    name: 'UN DESA Population Division',
    kind: 'stats-office',
    regions: ['global'],
    languages: ['en'],
    credibility: 'high',
    access: 'real',
    url: 'https://population.un.org/dataportal/',
    notes:
      'UN Data Portal 提供 REST API；家戶規模、世代同住、結婚年齡、'
      + '高齡人口比例等人口學指標，可程式化查詢，養老與成家門檻的跨國對照基準。',
  },
  {
    id: 'tw-dgbas',
    name: '中華民國主計總處（DGBAS）',
    kind: 'stats-office',
    regions: ['TW'],
    languages: ['zh'],
    credibility: 'high',
    access: 'stub',
    url: 'https://www.dgbas.gov.tw/mp.asp?mp=1',
    notes:
      'TODO: 開放資料平台（data.gov.tw）有家庭收支調查、戶口及住宅普查（含世代同住、'
      + '老年照護）CSV，但缺乏穩定機器可讀 API；E3 暫以 stub 替代。',
  },
  {
    id: 'jp-estat',
    name: '日本統計局 e-Stat',
    kind: 'stats-office',
    regions: ['JP'],
    languages: ['ja', 'en'],
    credibility: 'high',
    access: 'real',
    url: 'https://api.e-stat.go.jp/',
    notes:
      'e-Stat 提供 REST API（需申請免費 appId）；國勢調查、國民生活基礎調查'
      + '（含三代同堂、高齡者照護、家戶結構）均可查詢。',
  },
  {
    id: 'eurostat',
    name: 'Eurostat',
    kind: 'stats-office',
    regions: ['EU'],
    languages: ['en', 'multi'],
    credibility: 'high',
    access: 'real',
    url: 'https://ec.europa.eu/eurostat/web/json-and-unicode-web-services',
    notes:
      'Eurostat JSON-API；家戶組成、青年離家年齡、長照、結婚與生育'
      + '相關指標覆蓋 EU27 成員國，成年獨立與成家門檻的歐洲對照來源。',
  },
  {
    id: 'kr-kostat',
    name: '韓國統計廳（KOSTAT）',
    kind: 'stats-office',
    regions: ['KR'],
    languages: ['ko', 'en'],
    credibility: 'high',
    access: 'stub',
    url: 'https://kosis.kr/eng/',
    notes:
      'TODO: KOSIS 有英文介面（含家戶、婚姻、高齡照護統計），但 API 文件不完整；'
      + 'E3 暫以 stub 替代，待 API key 申請後啟用。',
  },

  // ── 學術資料庫（民族誌／人口學）──────────────────────────────────────────────
  {
    id: 'issp',
    name: 'International Social Survey Programme (ISSP)',
    kind: 'academic',
    regions: ['global'],
    languages: ['multi'],
    credibility: 'high',
    access: 'stub',
    url: 'https://issp.org/data-download/by-topic/',
    notes:
      'TODO: 資料集需在 GESIS 免費申請帳號後下載（ZA 編號）；Family and Changing '
      + 'Gender Roles 模組（家庭責任、世代義務、性別角色）直接相關。E3 暫 stub。',
  },
  {
    id: 'ehraf-ethnography',
    name: 'eHRAF World Cultures（人類關係區域檔案）',
    kind: 'academic',
    regions: ['global'],
    languages: ['multi'],
    credibility: 'high',
    access: 'stub',
    url: 'https://ehrafworldcultures.yale.edu/',
    notes:
      'TODO: 耶魯 HRAF 民族誌資料庫，涵蓋成年禮、婚俗、喪葬、親屬照護等跨文化習俗'
      + '的一手民族誌記述；需機構訂閱，E3 暫以 stub 產生示例引用。',
  },
  {
    id: 'cross-cultural-academic',
    name: '跨文化家庭研究（通用入口）',
    kind: 'academic',
    regions: ['global'],
    languages: ['multi'],
    credibility: 'high',
    access: 'stub',
    url: 'https://scholar.google.com/',
    notes:
      'TODO: 指向 Google Scholar / Semantic Scholar 的家庭、養老、喪俗、成年'
      + '等關鍵字查詢；E3 以 stub 產生示例引用，待整合 Semantic Scholar API。',
  },

  // ── 語料庫（discourse）────────────────────────────────────────────────────────
  {
    id: 'cc100-multilingual',
    name: 'CC-100 多語網頁語料庫',
    kind: 'discourse',
    regions: ['global'],
    languages: ['multi'],
    credibility: 'medium',
    access: 'stub',
    url: 'https://data.statmt.org/cc-100/',
    notes:
      '已授權的公開爬取語料（CommonCrawl 子集）；可供家庭與人生階段的語言／敘事模式'
      + '分析，但非原始調查或民族誌數據，引用時需標明來源性質。' +
      '注意：一般性論壇（Reddit、PTT、Dcard、微博⋯⋯）因 ToS／著作權疑慮一律排除（spec §10.5）。E3 暫 stub。',
  },
];

/**
 * 回傳適用於當前領域的來源白名單。
 * 目前回傳全部（單領域站點）；未來可依 domain 參數過濾。
 */
export function sourcesForDomain(): SourceWhitelistEntry[] {
  return SOURCE_WHITELIST;
}
