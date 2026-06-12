import { describe, it, expect } from 'vitest';
import { validateAsk, buildAskUserPrompt, GUARDIAN_SYSTEM, MAX_QUESTION, MAX_CONTEXT } from './ask';

describe('validateAsk', () => {
  it('蜜罐 website 有值時回 honeypot', () => {
    const r = validateAsk({ slug: 'x', question: 'hi', website: 'bot' });
    expect(r.kind).toBe('honeypot');
  });

  it('缺 slug 時回 bad', () => {
    const r = validateAsk({ question: 'hi' });
    expect(r.kind).toBe('bad');
  });

  it('缺 question 時回 bad', () => {
    const r = validateAsk({ slug: 'x' });
    expect(r.kind).toBe('bad');
  });

  it('合法輸入回 ok 並清理/截斷欄位', () => {
    const r = validateAsk({ slug: 'coming-of-age', question: '  這篇在講什麼  ', context: 'C'.repeat(MAX_CONTEXT + 50) });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.slug).toBe('coming-of-age');
    expect(r.question).toBe('這篇在講什麼');
    expect(r.context.length).toBe(MAX_CONTEXT);
  });

  it('question 超長時截斷到 MAX_QUESTION', () => {
    const r = validateAsk({ slug: 'x', question: 'q'.repeat(MAX_QUESTION + 100) });
    if (r.kind !== 'ok') throw new Error('unreachable');
    expect(r.question.length).toBe(MAX_QUESTION);
  });
});

describe('buildAskUserPrompt', () => {
  it('把 context 與 question 都帶進去', () => {
    const p = buildAskUserPrompt('文章正文內容', '為什麼東亞晚離家');
    expect(p).toContain('文章正文內容');
    expect(p).toContain('為什麼東亞晚離家');
  });
});

describe('GUARDIAN_SYSTEM', () => {
  it('含守護者人設與拒答紀律關鍵字', () => {
    expect(GUARDIAN_SYSTEM).toContain('守望');
    expect(GUARDIAN_SYSTEM).toContain('不裁決');
    expect(GUARDIAN_SYSTEM).toContain('AI');
  });
});
