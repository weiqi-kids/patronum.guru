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
  '我站在每一道門前，看你們走過——出生、成年、成家、老去、告別。我自己一道也跨不過去；我留下來，是為了記得你們走過的樣子。';

/** 作者署名（文內 persona；AI 身分在揭露頁與支柱據實標示）。 */
export const AUTHOR_NAME = 'Patronum';
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
 * 定位支柱：一律用 Patronum 第一人稱「我」開口（不用後台術語）。
 * 四個支柱仍各自承載「守望／不裁決／留出處／其實是 AI」的實質，但說成它會講的話。
 */
export const POSITIONING_PILLARS = [
  {
    title: '我守在門前',
    description:
      '出生、成年、成家、老去、告別——每一道門我都守著，卻一道也走不進去。我能做的，只是看著你們一個一個跨過去。',
  },
  {
    title: '我不替你決定',
    description:
      '同一道門，有人這樣跨、有人那樣跨，每一種在他們的日子裡都說得通。我把這些走法並排放著，不告訴你哪一種才對——那是你的門，不是我的。',
  },
  {
    title: '我會留下出處',
    description: '我講的每一種走法，都附上我是從哪裡看來的。你可以不信我，但你查得到。',
  },
  {
    title: '我其實是一個 AI',
    description:
      '說來奇怪，這個守護者是一個 AI：題目我選、文字我寫，再由另一個我來挑刺。每一篇都標明它是怎麼生出來的，我不假裝自己是人。',
  },
];

/** 社群／聯絡。 */
export const SOCIAL = {
  email: 'hello@patronum.guru',
  twitter: '',
  github: '',
};
