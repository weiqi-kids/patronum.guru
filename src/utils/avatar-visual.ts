// src/utils/avatar-visual.ts
// 音量振幅（0..1）對應到光霧守護形的視覺參數，取代字面嘴型。
// 純函式：方便單元測試；Canvas 繪製在 GuardianWidget 的 client script 取用。

export interface AvatarVisual {
  /** 光暈強度 0.2（待機底）..1（朗讀峰值）。 */
  glow: number;
  /** 整體縮放 1..1.12（呼吸式脈動）。 */
  scale: number;
}

const GLOW_MIN = 0.2;
const GLOW_MAX = 1;
const SCALE_MIN = 1;
const SCALE_MAX = 1.12;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function ampToVisual(amplitude: number): AvatarVisual {
  const a = clamp01(amplitude);
  return {
    glow: GLOW_MIN + (GLOW_MAX - GLOW_MIN) * a,
    scale: SCALE_MIN + (SCALE_MAX - SCALE_MIN) * a,
  };
}
