import { describe, it, expect } from 'vitest';
import { SelectionSchema, AnchorResultSchema } from './schemas';

const validSelection = {
  title: '年邁的父母由誰照顧？養老門檻前的東亞與北歐',
  description: 'Patronum 守在養老這道門前，守望照護責任歸屬的跨文化態度光譜。',
  domainTopic: 'eldercare',
  gateClass: 'present' as const,
  tension: '照護是家庭的孝道責任，還是制度應承擔的權利？',
  sensitivityLevel: 'tender' as const,
  stanceRiskLevel: 'low' as const,
  anchorSuggestion: 'Nordic',
  comparedSuggestions: ['East Asia', 'United States'],
  reason: '差異源於長照制度與人口結構等處境。',
};

describe('SelectionSchema', () => {
  it('合法 Selection 應通過', () => {
    expect(() => SelectionSchema.parse(validSelection)).not.toThrow();
  });

  it('select 階段允許 gateClass=reject（由下游 gate 拒絕）', () => {
    expect(() =>
      SelectionSchema.parse({ ...validSelection, gateClass: 'reject' }),
    ).not.toThrow();
  });

  it('gateClass=bogus 應被拒絕', () => {
    expect(() =>
      SelectionSchema.parse({ ...validSelection, gateClass: 'bogus' }),
    ).toThrow();
  });

  it('sensitivityLevel=bogus 應被拒絕', () => {
    expect(() =>
      SelectionSchema.parse({ ...validSelection, sensitivityLevel: 'bogus' }),
    ).toThrow();
  });
});

describe('AnchorResultSchema', () => {
  it('insufficient 且無 anchor 應通過', () => {
    expect(() =>
      AnchorResultSchema.parse({ status: 'insufficient', note: '證據不足' }),
    ).not.toThrow();
  });
});
