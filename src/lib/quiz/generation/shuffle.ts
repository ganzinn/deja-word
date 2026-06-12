/** `Math.random` 互換の乱数生成器。本番は `Math.random`、unit test はシード付き PRNG を注入する。 */
export type Rng = () => number;

/** Fisher–Yates シャッフル。入力配列は変更せず、シャッフル済みの新しい配列を返す。 */
export function fisherYatesShuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 配列から重複なしで最大 n 件を無作為に選ぶ（n が要素数を超える場合は全件）。 */
export function pickN<T>(items: T[], n: number, rng: Rng): T[] {
  return fisherYatesShuffle(items, rng).slice(0, n);
}
