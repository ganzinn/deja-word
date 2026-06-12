import { describe, expect, test } from "vitest";

import {
  hasValidDummyCandidate,
  QuizGenerationError,
  selectDummies,
  type DummyCandidate,
} from "@/lib/quiz/generation/dummy-pool";
import { seededRng } from "../../../../tests/setup/seeded-rng";

function candidate(value: string, texts?: string[]): DummyCandidate<string> {
  return { value, texts: texts ?? [value] };
}

describe("selectDummies", () => {
  test("picks desiredCount from the primary pool when it has enough candidates", () => {
    const primary = ["p1", "p2", "p3", "p4", "p5"].map((v) => candidate(v));
    const fallback = ["f1", "f2"].map((v) => candidate(v));
    const selected = selectDummies({
      correctTexts: ["正解"],
      primaryPool: primary,
      fallbackPool: fallback,
      desiredCount: 3,
      rng: seededRng(1),
    });
    expect(selected).toHaveLength(3);
    for (const v of selected) expect(v.startsWith("p")).toBe(true);
  });

  test("excludes candidates whose any text matches a correct text after trim", () => {
    const primary = [candidate("collides", ["  走る  ", "別訳"]), candidate("ok", ["歩く"])];
    const selected = selectDummies({
      correctTexts: ["走る "],
      primaryPool: primary,
      fallbackPool: [],
      desiredCount: 2,
      rng: seededRng(1),
    });
    expect(selected).toEqual(["ok"]);
  });

  test("dedupes among selected dummies by trim-exact text match", () => {
    const primary = [
      candidate("a", ["同じ訳"]),
      candidate("b", [" 同じ訳 "]),
      candidate("c", ["別の訳"]),
    ];
    const selected = selectDummies({
      correctTexts: ["正解"],
      primaryPool: primary,
      fallbackPool: [],
      desiredCount: 3,
      rng: seededRng(1),
    });
    expect(selected).toHaveLength(2);
    expect(selected).toContain("c");
    expect(selected.filter((v) => v === "a" || v === "b")).toHaveLength(1);
  });

  test("supplements only the shortfall from the fallback pool, keeping primary picks", () => {
    const primary = [candidate("p1"), candidate("p2")];
    const fallback = [candidate("f1"), candidate("f2"), candidate("f3")];
    const selected = selectDummies({
      correctTexts: ["正解"],
      primaryPool: primary,
      fallbackPool: fallback,
      desiredCount: 3,
      rng: seededRng(1),
    });
    expect(selected).toHaveLength(3);
    expect(selected.filter((v) => v.startsWith("p")).sort()).toEqual(["p1", "p2"]);
    expect(selected.filter((v) => v.startsWith("f"))).toHaveLength(1);
  });

  test("dedupes fallback candidates against correct texts and already-picked dummies", () => {
    const primary = [candidate("p1", ["訳A"])];
    const fallback = [
      candidate("f-collides-correct", ["正解"]),
      candidate("f-collides-dummy", ["訳A"]),
    ];
    const selected = selectDummies({
      correctTexts: ["正解"],
      primaryPool: primary,
      fallbackPool: fallback,
      desiredCount: 3,
      rng: seededRng(1),
    });
    expect(selected).toEqual(["p1"]);
  });

  test("degrades to fewer dummies than desired when pools run short", () => {
    const selected = selectDummies({
      correctTexts: ["正解"],
      primaryPool: [candidate("only")],
      fallbackPool: [],
      desiredCount: 3,
      rng: seededRng(1),
    });
    expect(selected).toEqual(["only"]);
  });

  test("throws QuizGenerationError when no dummy can be selected", () => {
    expect(() =>
      selectDummies({
        correctTexts: ["正解"],
        primaryPool: [candidate("x", ["正解"])],
        fallbackPool: [candidate("y", [" 正解 "])],
        desiredCount: 3,
        rng: seededRng(1),
      }),
    ).toThrow(QuizGenerationError);
  });

  test("is deterministic for the same seed", () => {
    const primary = ["p1", "p2", "p3", "p4", "p5"].map((v) => candidate(v));
    const run = () =>
      selectDummies({
        correctTexts: [],
        primaryPool: primary,
        fallbackPool: [],
        desiredCount: 3,
        rng: seededRng(123),
      });
    expect(run()).toEqual(run());
  });
});

describe("hasValidDummyCandidate", () => {
  test("returns true when a candidate has no text colliding with correct texts", () => {
    expect(hasValidDummyCandidate(["走る"], [candidate("a", ["歩く"])])).toBe(true);
  });

  test("returns false when all candidates collide after trim", () => {
    expect(
      hasValidDummyCandidate(
        ["走る"],
        [candidate("a", [" 走る "]), candidate("b", ["走る", "歩く"])],
      ),
    ).toBe(false);
  });

  test("returns false for an empty candidate list", () => {
    expect(hasValidDummyCandidate(["走る"], [])).toBe(false);
  });
});
