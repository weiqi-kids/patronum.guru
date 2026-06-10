import type { CollectionEntry } from 'astro:content';

/**
 * Life-threshold categories for patronum.guru.
 *
 * 每個門檻對應一個 design token（`--color-topic-*`，定義於 src/styles/tokens.css）。
 * 下方 `color` 欄位是該 OKLCH token 的 sRGB hex 等值，供非 CSS 消費者使用
 * （如 og 生成、JSON-LD）。若 tokens.css 改動，請同步此處。
 *
 * slug 必須與 tokens.css 的 `--color-topic-<slug>` 一致。
 * 正典 5：coming-of-age, living-together, eldercare, union, farewell；
 * 延伸 2：birth, leaving-home。
 */
export type ArticleCategorySlug =
  | 'coming-of-age'
  | 'living-together'
  | 'eldercare'
  | 'union'
  | 'farewell'
  | 'birth'
  | 'leaving-home';

export interface ArticleCategory {
  slug: ArticleCategorySlug;
  label: string;
  description: string;
  /** CSS custom property name, e.g. '--color-topic-coming-of-age'. */
  token: string;
  /** sRGB hex equivalent of the token (for non-CSS consumers). */
  color: string;
}

export type CategorizedArticle = CollectionEntry<'articles'> & {
  categorySlug: ArticleCategorySlug;
  categoryLabel: string;
};

export const ARTICLE_CATEGORIES: ArticleCategory[] = [
  {
    slug: 'coming-of-age',
    label: '成年與獨立',
    description: '何時算長大、如何脫離父母、獨立的門檻與成年儀式的跨文化分歧。',
    token: '--color-topic-coming-of-age',
    color: '#8d5136',
  },
  {
    slug: 'living-together',
    label: '與父母同住',
    description: '成年後與父母同住或分居、世代共居與界線的觀念差異。',
    token: '--color-topic-living-together',
    color: '#7f4541',
  },
  {
    slug: 'eldercare',
    label: '養老與照護',
    description: '長者照護、奉養責任、機構與居家照顧、世代義務的文化張力。',
    token: '--color-topic-eldercare',
    color: '#2f5c70',
  },
  {
    slug: 'union',
    label: '成家與結合',
    description: '婚姻、伴侶、組成家庭的形式與意義在不同文化中的差異。',
    token: '--color-topic-union',
    color: '#3b694c',
  },
  {
    slug: 'farewell',
    label: '送別與喪葬',
    description: '臨終、喪親、喪葬與哀悼的實踐如何因文化而異（高敏感題）。',
    token: '--color-topic-farewell',
    color: '#685c81',
  },
  {
    slug: 'birth',
    label: '出生與新生',
    description: '生育、迎接新生命、產後與育兒初期的安排與態度差異。',
    token: '--color-topic-birth',
    color: '#5a6b3b',
  },
  {
    slug: 'leaving-home',
    label: '離家',
    description: '離開原生家庭、為求學或就業而搬遷、空巢與重新連結的文化分歧。',
    token: '--color-topic-leaving-home',
    color: '#4a5b81',
  },
];

const CATEGORY_LABEL_MAP = new Map(
  ARTICLE_CATEGORIES.map((category) => [category.slug, category.label]),
);

const CATEGORY_KEYWORDS: Record<ArticleCategorySlug, string[]> = {
  'coming-of-age': [
    '成年',
    '成年禮',
    '長大',
    '獨立',
    '自立',
    '轉大人',
    '十八歲',
    '成人儀式',
    'coming-of-age',
    '青年',
  ],
  'living-together': [
    '同住',
    '共居',
    '三代同堂',
    '多代同堂',
    '與父母',
    '住一起',
    '分居',
    '搬出去',
    '世代',
    '住家裡',
  ],
  eldercare: [
    '養老',
    '照護',
    '奉養',
    '長照',
    '安養',
    '孝養',
    '長者',
    '照顧父母',
    '老後',
    '銀髮',
  ],
  union: [
    '婚姻',
    '結婚',
    '成家',
    '伴侶',
    '配偶',
    '同居',
    '結合',
    '嫁娶',
    '組成家庭',
    '婚禮',
  ],
  farewell: [
    '送別',
    '喪葬',
    '喪親',
    '臨終',
    '哀悼',
    '葬禮',
    '告別',
    '死亡',
    '守靈',
    '追思',
  ],
  birth: [
    '出生',
    '新生',
    '生育',
    '生產',
    '坐月子',
    '育兒',
    '嬰兒',
    '迎接新生命',
    '產後',
    '滿月',
  ],
  'leaving-home': [
    '離家',
    '離巢',
    '空巢',
    '搬離',
    '出外',
    '遠行',
    '離鄉',
    '求學',
    '搬遷',
    '獨居',
  ],
};

function containsKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function getSearchText(article: CollectionEntry<'articles'>): string {
  const data = article.data;

  return [
    data.domainTopic,
    data.title,
    data.description,
    data.tldr,
    ...(data.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase();
}

export function classifyArticle(
  article: CollectionEntry<'articles'>,
): ArticleCategorySlug {
  const text = getSearchText(article);

  if (containsKeyword(text, CATEGORY_KEYWORDS['coming-of-age']))
    return 'coming-of-age';
  if (containsKeyword(text, CATEGORY_KEYWORDS['living-together']))
    return 'living-together';
  if (containsKeyword(text, CATEGORY_KEYWORDS.eldercare)) return 'eldercare';
  if (containsKeyword(text, CATEGORY_KEYWORDS.union)) return 'union';
  if (containsKeyword(text, CATEGORY_KEYWORDS.farewell)) return 'farewell';
  if (containsKeyword(text, CATEGORY_KEYWORDS.birth)) return 'birth';
  if (containsKeyword(text, CATEGORY_KEYWORDS['leaving-home']))
    return 'leaving-home';

  return 'coming-of-age';
}

export function categorizeArticles(
  articles: CollectionEntry<'articles'>[],
): CategorizedArticle[] {
  return articles.map((article) => {
    const categorySlug = classifyArticle(article);
    const categoryLabel =
      CATEGORY_LABEL_MAP.get(categorySlug) ??
      (ARTICLE_CATEGORIES.find((c) => c.slug === 'coming-of-age')
        ?.label as string);

    return {
      ...article,
      categorySlug,
      categoryLabel,
    };
  });
}
