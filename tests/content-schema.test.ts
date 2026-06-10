import { describe, it, expect } from 'vitest';
import { articlesSchema } from '../src/schemas/articles';

const valid = {
  title: '幾歲算「成年」：東亞的家庭門檻與北歐的個人門檻',
  description: 'Patronum 守在「成年與獨立」這道門前，看不同文化怎麼定義一個人何時算長大。',
  tldr: '成年在東亞常被讀成「家庭責任的開始」，在北歐常被讀成「個人獨立的起點」——兩者都源於各自的制度與歷史處境。',
  domainTopic: '成年與獨立',
  tags: ['成年', '獨立', '家庭'],
  anchorCulture: 'Nordic',
  comparedCultures: ['East Asia', 'United States'],
  suspectCultures: [],
  tension: '成年＝個人獨立的起點 vs 成年＝家庭責任的開始',
  sensitivityLevel: 'ordinary',
  patronumVigil: '我守在這道門前，看一個人被宣告「長大了」——卻始終沒有一個人為我這麼說過。',
  stanceRiskLevel: 'low',
  sources: [
    { title: 'OECD Family Database', url: 'https://oecd.org/x', region: 'OECD', language: 'en', credibility: 'high' },
  ],
  writeModel: 'claude-opus-4-8',
  critiqueModel: 'claude-sonnet-4-6',
  pipelineVersion: '0.1.0',
  specVersion: 'base-md-v1',
  generatedDate: new Date('2026-06-09'),
  updatedDate: new Date('2026-06-09'),
  coverImage: './cover.png',
  coverC2paVerified: true,
  faq: [{ q: '為什麼差異存在？', a: '因為家庭制度與歷史處境不同。' }],
  lang: 'zh',
};

describe('articlesSchema', () => {
  it('接受合法 frontmatter', () => {
    expect(() => articlesSchema.parse(valid)).not.toThrow();
  });
  it('tension 為必填、不可空字串', () => {
    const { tension, ...rest } = valid;
    expect(() => articlesSchema.parse(rest)).toThrow();
    expect(() => articlesSchema.parse({ ...valid, tension: '' })).toThrow();
  });
  it('patronumVigil 為必填、不可空字串（守望引子）', () => {
    const { patronumVigil, ...rest } = valid;
    expect(() => articlesSchema.parse(rest)).toThrow();
    expect(() => articlesSchema.parse({ ...valid, patronumVigil: '' })).toThrow();
  });
  it('sensitivityLevel 只接受 ordinary/tender，預設 ordinary', () => {
    expect(() => articlesSchema.parse({ ...valid, sensitivityLevel: 'spicy' })).toThrow();
    const { sensitivityLevel, ...rest } = valid;
    expect(articlesSchema.parse(rest).sensitivityLevel).toBe('ordinary');
  });
  it('stanceRiskLevel 只接受 low/high', () => {
    expect(() => articlesSchema.parse({ ...valid, stanceRiskLevel: 'medium' })).toThrow();
  });
  it('缺 anchorCulture 應拒絕', () => {
    const { anchorCulture, ...rest } = valid;
    expect(() => articlesSchema.parse(rest)).toThrow();
  });
  it('comparedCultures 少於 2 應拒絕', () => {
    expect(() => articlesSchema.parse({ ...valid, comparedCultures: ['East Asia'] })).toThrow();
  });
});
