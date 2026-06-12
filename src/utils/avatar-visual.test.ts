import { describe, it, expect } from 'vitest';
import { ampToVisual } from './avatar-visual';

describe('ampToVisual', () => {
  it('靜音時回基準值（最小光暈、縮放 1）', () => {
    const v = ampToVisual(0);
    expect(v.glow).toBeCloseTo(0.2, 5);
    expect(v.scale).toBeCloseTo(1, 5);
  });

  it('最大音量時光暈與縮放達上限', () => {
    const v = ampToVisual(1);
    expect(v.glow).toBeCloseTo(1, 5);
    expect(v.scale).toBeCloseTo(1.12, 5);
  });

  it('輸入超出 [0,1] 會夾住', () => {
    expect(ampToVisual(-5).glow).toBeCloseTo(0.2, 5);
    expect(ampToVisual(9).glow).toBeCloseTo(1, 5);
  });

  it('單調遞增', () => {
    expect(ampToVisual(0.3).glow).toBeLessThan(ampToVisual(0.7).glow);
  });
});
