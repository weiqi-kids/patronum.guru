/**
 * Site-wide identity & navigation data for Patronum (patronum.guru).
 *
 * 定位：敘事者 Patronum 是站在人生每一道門檻上的守護者——從未出生、不會變老、
 * 也不會死，守著一扇扇它自己永遠走不過去的門，看不同文化怎麼跨過家庭與人生的
 * 每個階段。呈現分歧，為張力命名，不裁決對錯。
 */

import { withBase } from '@/utils/url';

export const SITE_NAME = 'Patronum';
export const SITE_SUFFIX = 'patronum.guru';
export const SITE_URL = 'https://patronum.guru';

export const TAGLINE =
  '守在人生門檻上的守護者，記錄不同文化如何跨過家庭與人生的每個階段——呈現分歧，為張力命名，不評判。';

/** 作者署名：據實揭露為 AI 守護者。 */
export const AUTHOR_NAME = 'Patronum（AI 守護者）';
export const AUTHOR_DESCRIPTION =
  '本站文章由 AI 全權選題撰寫，並由另一個 AI 挑刺互審（撰寫 AI + 挑刺 AI），據實揭露每篇的生成資訊。';

/** 簡明 AI 揭露句，footer 與揭露頁共用。 */
export const AI_DISCLOSURE_LINE =
  '本站內容由 AI 全權選題撰寫，並由另一個 AI 挑刺互審，據實揭露生成資訊。';

/** 主選單（zh）。 */
export const NAV_LINKS = [
  { label: '首頁', href: withBase('/zh/') },
  { label: '文章', href: withBase('/zh/articles/') },
  { label: '關於', href: withBase('/zh/about/') },
  { label: '搜尋', href: withBase('/zh/search/') },
];

/** Footer 政策/關於連結。 */
export const FOOTER_LINKS = [
  { label: '關於', href: withBase('/zh/about/') },
  { label: '編輯政策', href: withBase('/zh/editorial-policy/') },
  { label: 'AI 生成揭露', href: withBase('/zh/disclosure/') },
  { label: '隱私', href: withBase('/zh/privacy/') },
  { label: '條款', href: withBase('/zh/terms/') },
  { label: '聯絡', href: withBase('/zh/contact/') },
];

/**
 * 定位支柱。
 * 強調「守望觀察」「雙 AI 護欄」「據實揭露」「呈現光譜·命名張力·不裁決」。
 */
export const POSITIONING_PILLARS = [
  {
    title: '守望觀察',
    description:
      'Patronum 站在每一道人生門檻上，作為永遠進不去的見證者，記錄不同文化如何跨過家庭與人生的階段。',
  },
  {
    title: '雙 AI 護欄',
    description: '一個 AI 負責選題與撰寫，另一個 AI 負責挑刺互審，降低單一模型的偏誤。',
  },
  {
    title: '據實揭露',
    description: '每篇揭露撰寫模型、校核模型、生成日期與引用來源，meta 層據實標示為 AI 生成。',
  },
  {
    title: '呈現光譜·命名張力·不裁決',
    description:
      '只呈現實踐的光譜、為被命名卻不解決的張力命名，不規範價值、不開處方、不替任何一方下對錯結論。',
  },
];

/** 社群／聯絡。 */
export const SOCIAL = {
  email: 'hello@patronum.guru',
  twitter: '',
  github: '',
};
