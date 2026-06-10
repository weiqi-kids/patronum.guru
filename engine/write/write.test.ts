// engine/write/write.test.ts
//
// E7 撰寫 AI 測試（STUB 模式，不發任何真實 API）。
// selection / anchor / evidence 全部在測試內手工構造。
//
// 重點驗證：
//   - 合法 present + ok anchor + ok evidence → frontmatter 過 articlesSchema（不丟）。
//   - 生成資訊「生成當下」寫入、不寫死：
//       * writeModel === 'stub'（STUB 模式的實際 model）。
//       * critiqueModel === 'pending'（佔位，待 E9 覆寫）。
//       * pipelineVersion / specVersion === 常數。
//       * generatedDate 來自注入的 now；兩個不同 now → 不同 generatedDate。
//   - frontmatter 帶 tension / sensitivityLevel / patronumVigil（取代舊的事實分類欄位）。
//   - guard 會丟：anchor insufficient / gateClass reject。
//   - markdown round-trip：yaml.load frontmatter 區塊 → 關鍵欄位相符。
//   - body 含「我」與守望者結構（Patronum 守望者口吻）。

import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';

import { writeArticle } from './index.js';
import { articlesSchema } from '../../src/schemas/articles';
import { PIPELINE_VERSION, SPEC_VERSION } from '../version.js';
import type { Selection, AnchorResult, EvidenceResult } from '../schemas.js';

// 確保跑測試時為 STUB 模式（無 key）。
delete process.env.ANTHROPIC_API_KEY;

const NOW = '2026-06-10T08:30:00.000Z';

function makeSelection(over?: Partial<Selection>): Selection {
  return {
    title: '年邁的父母由誰照顧？養老門檻前的東亞與北歐',
    description:
      '同樣面對年邁雙親需要照顧，東亞傾向把照護理解為孝道責任，北歐傾向視之為制度應提供的權利。',
    domainTopic: 'eldercare',
    gateClass: 'present',
    tension: '照護是家庭的孝道責任，還是制度應承擔的權利？',
    sensitivityLevel: 'tender',
    stanceRiskLevel: 'low',
    anchorSuggestion: 'Nordic（北歐）',
    comparedSuggestions: ['East Asia（東亞）', 'United States（美國）'],
    reason: '世代同住與長照支出有 OECD Family Database 支撐，差異源於長照制度與人口結構。',
    ...over,
  };
}

function makeAnchor(over?: Partial<AnchorResult>): AnchorResult {
  return {
    status: 'ok',
    anchorCulture: 'Nordic（北歐）',
    comparedCultures: ['East Asia（東亞）', 'United States（美國）'],
    suspectCultures: [],
    ...over,
  };
}

function makeEvidence(over?: Partial<EvidenceResult>): EvidenceResult {
  return {
    status: 'ok',
    sources: [
      {
        title: 'OECD Hours Worked',
        url: 'https://data.oecd.org/emp/hours-worked.htm',
        region: 'OECD',
        language: 'en',
        credibility: 'high',
      },
      {
        title: '日本 厚生労働省 労働時間統計',
        url: 'https://www.mhlw.go.jp/toukei/',
        region: 'JP',
        language: 'ja',
        credibility: 'high',
      },
    ],
    ...over,
  };
}

describe('writeArticle（E7 撰寫 AI，STUB）', () => {
  it('合法輸入 → frontmatter 過 articlesSchema，關鍵欄位正確', async () => {
    const { draft, model, stub } = await writeArticle(
      { selection: makeSelection(), anchor: makeAnchor(), evidence: makeEvidence(), now: NOW },
    );

    // 不丟 → 已過 articlesSchema（writeArticle 內部已 parse，這裡再 parse 一次確認）。
    expect(() => articlesSchema.parse(draft.frontmatter)).not.toThrow();

    expect(stub).toBe(true);
    expect(model).toBe('stub');

    const fm = draft.frontmatter;
    expect(fm.writeModel).toBe('stub'); // 生成資訊：實際 model，非寫死
    expect(fm.critiqueModel).toBe('pending'); // 佔位，待 E9 覆寫
    // Patronum 門檻語意（取代舊的事實分類欄位）：
    expect(fm.tension.length).toBeGreaterThan(0);
    expect(fm.sensitivityLevel).toBe('tender');
    expect(fm.patronumVigil.length).toBeGreaterThan(0);
    expect(fm.comparedCultures.length).toBeGreaterThanOrEqual(2);
    expect(fm.comparedCultures.length).toBeLessThanOrEqual(4);
    expect(fm.sources.length).toBeGreaterThanOrEqual(1);
    expect(fm.tldr.length).toBeGreaterThan(0);
  });

  it('pipelineVersion / specVersion 等於常數；generatedDate 來自注入的 now', async () => {
    const { draft } = await writeArticle(
      { selection: makeSelection(), anchor: makeAnchor(), evidence: makeEvidence(), now: NOW },
    );
    expect(draft.frontmatter.pipelineVersion).toBe(PIPELINE_VERSION);
    expect(draft.frontmatter.specVersion).toBe(SPEC_VERSION);
    // articlesSchema z.coerce.date() → Date；ISO 開頭應為注入 now 的日期。
    expect(draft.frontmatter.generatedDate.toISOString().slice(0, 10)).toBe('2026-06-10');
    expect(draft.frontmatter.updatedDate.toISOString().slice(0, 10)).toBe('2026-06-10');
  });

  it('不寫死：兩個不同 now → 不同 generatedDate', async () => {
    const a = await writeArticle(
      { selection: makeSelection(), anchor: makeAnchor(), evidence: makeEvidence(), now: '2026-06-10T00:00:00.000Z' },
    );
    const b = await writeArticle(
      { selection: makeSelection(), anchor: makeAnchor(), evidence: makeEvidence(), now: '2025-01-02T00:00:00.000Z' },
    );
    expect(a.draft.frontmatter.generatedDate.toISOString().slice(0, 10)).toBe('2026-06-10');
    expect(b.draft.frontmatter.generatedDate.toISOString().slice(0, 10)).toBe('2025-01-02');
    expect(a.draft.frontmatter.generatedDate.getTime()).not.toBe(
      b.draft.frontmatter.generatedDate.getTime(),
    );
  });

  it('guard：anchor.status=insufficient → 丟', async () => {
    await expect(
      writeArticle({
        selection: makeSelection(),
        anchor: makeAnchor({ status: 'insufficient', anchorCulture: undefined, comparedCultures: undefined }),
        evidence: makeEvidence(),
        now: NOW,
      }),
    ).rejects.toThrow();
  });

  it('guard：selection.gateClass=reject → 丟', async () => {
    await expect(
      writeArticle({
        selection: makeSelection({ gateClass: 'reject' }),
        anchor: makeAnchor(),
        evidence: makeEvidence(),
        now: NOW,
      }),
    ).rejects.toThrow();
  });

  it('guard：evidence.status=insufficient → 丟', async () => {
    await expect(
      writeArticle({
        selection: makeSelection(),
        anchor: makeAnchor(),
        evidence: makeEvidence({ status: 'insufficient' }),
        now: NOW,
      }),
    ).rejects.toThrow();
  });

  it('markdown round-trip：yaml.load frontmatter 區塊 → 關鍵欄位相符', async () => {
    const { draft } = await writeArticle(
      { selection: makeSelection(), anchor: makeAnchor(), evidence: makeEvidence(), now: NOW },
    );

    // 抽出 --- ... --- 之間的 YAML。
    const match = draft.markdown.match(/^---\n([\s\S]*?)\n---\n/);
    expect(match).not.toBeNull();
    const loaded = yaml.load(match![1]) as Record<string, unknown>;

    expect(loaded.title).toBe(draft.frontmatter.title);
    expect(loaded.writeModel).toBe('stub');
    expect(loaded.critiqueModel).toBe('pending');
    expect(loaded.tension).toBe(draft.frontmatter.tension);
    expect(loaded.sensitivityLevel).toBe('tender');
    expect(typeof loaded.patronumVigil).toBe('string');
    expect((loaded.patronumVigil as string).length).toBeGreaterThan(0);
    expect(loaded.pipelineVersion).toBe(PIPELINE_VERSION);
    expect(loaded.specVersion).toBe(SPEC_VERSION);
    // YAML 內保留為 'YYYY-MM-DD' 字串（或 js-yaml 解析的 Date，統一轉字串比對日期）。
    const loadedDate =
      loaded.generatedDate instanceof Date
        ? loaded.generatedDate.toISOString().slice(0, 10)
        : String(loaded.generatedDate).slice(0, 10);
    expect(loadedDate).toBe('2026-06-10');
    expect(Array.isArray(loaded.comparedCultures)).toBe(true);
  });

  it('body 含「我」與守望者結構（Patronum 守望者口吻）', async () => {
    const { draft } = await writeArticle(
      { selection: makeSelection(), anchor: makeAnchor(), evidence: makeEvidence(), now: NOW },
    );
    expect(draft.body).toContain('我');
    expect(draft.body).toContain('我守在這道'); // 守望者口吻
    // 模板節：定錨節「## 站在」+ 倒數第二節（標題自取，stub 用「## 兩種都站得住」）+ 守望收束節。
    expect(draft.body).toContain('## 站在');
    expect(draft.body).toContain('## 兩種都站得住');
    expect(draft.body).toContain('## 我守在這道門前');
  });

  it('patronumVigil 等於 body 開場第一句（守望引子）', async () => {
    const { draft } = await writeArticle(
      { selection: makeSelection(), anchor: makeAnchor(), evidence: makeEvidence(), now: NOW },
    );
    const firstLine = draft.body.split('\n').map((l) => l.trim()).find((l) => l.length > 0)!;
    const firstSentence = firstLine.split(/(?<=[。！？])/)[0].trim();
    expect(draft.frontmatter.patronumVigil).toBe(firstSentence);
    expect(draft.frontmatter.patronumVigil.length).toBeGreaterThan(0);
  });

  it('opts.stubBody 可注入自訂 body', async () => {
    const { draft } = await writeArticle(
      { selection: makeSelection(), anchor: makeAnchor(), evidence: makeEvidence(), now: NOW },
      { stubBody: () => '我注入的測試本文' },
    );
    expect(draft.body).toBe('我注入的測試本文');
    expect(draft.markdown).toContain('我注入的測試本文');
  });
});
