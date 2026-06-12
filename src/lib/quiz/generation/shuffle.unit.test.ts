import { describe, expect, test } from "vitest";

import { fisherYatesShuffle, pickN } from "@/lib/quiz/generation/shuffle";
import { seededRng } from "../../../../tests/setup/seeded-rng";

describe("fisherYatesShuffle", () => {
  test("reproduces the Fisher–Yates order for a hand-computed rng sequence", () => {
    // rng が常に 0 を返す場合: 各ステップで j=0 となり末尾から先頭へスワップされる。
    // [a, b, c] → i=2: [c, b, a] → i=1: [b, c, a]
    expect(fisherYatesShuffle(["a", "b", "c"], () => 0)).toEqual(["b", "c", "a"]);
    // rng が 1 に近い値を返す場合: 常に j=i で並びは変わらない。
    expect(fisherYatesShuffle(["a", "b", "c"], () => 0.999)).toEqual(["a", "b", "c"]);
  });

  test("is deterministic for the same seed and a permutation of the input", () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const first = fisherYatesShuffle(items, seededRng(42));
    const second = fisherYatesShuffle(items, seededRng(42));
    expect(first).toEqual(second);
    expect([...first].sort((a, b) => a - b)).toEqual(items);
  });

  test("produces different orders for different seeds (sanity)", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(fisherYatesShuffle(items, seededRng(1))).not.toEqual(
      fisherYatesShuffle(items, seededRng(2)),
    );
  });

  test("does not mutate the input array", () => {
    const items = [1, 2, 3];
    fisherYatesShuffle(items, seededRng(1));
    expect(items).toEqual([1, 2, 3]);
  });
});

describe("pickN", () => {
  test("picks n distinct items from the source", () => {
    const items = ["a", "b", "c", "d", "e"];
    const picked = pickN(items, 3, seededRng(7));
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    for (const p of picked) expect(items).toContain(p);
  });

  test("returns all items when n exceeds the length", () => {
    const picked = pickN(["a", "b"], 5, seededRng(7));
    expect([...picked].sort()).toEqual(["a", "b"]);
  });

  test("is deterministic for the same seed", () => {
    const items = [1, 2, 3, 4, 5];
    expect(pickN(items, 2, seededRng(9))).toEqual(pickN(items, 2, seededRng(9)));
  });
});
