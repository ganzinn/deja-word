import type { Rng } from "@/lib/quiz/generation/shuffle";

/**
 * シード付き決定的 PRNG（mulberry32）。unit テストで RNG 注入の純関数を
 * 決定的に検証するためのヘルパ。同じシードなら同じ系列を返す。
 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
