import { describe, expect, test } from "vitest";

import { isSpellingCorrect, normalizeSpelling } from "@/lib/quiz/spelling";

describe("normalizeSpelling", () => {
  test("trims surrounding whitespace and lowercases", () => {
    expect(normalizeSpelling("  Apple ")).toBe("apple");
    expect(normalizeSpelling("RUN")).toBe("run");
  });

  test("keeps inner spaces and non-alphabetic characters", () => {
    expect(normalizeSpelling("  Take Off ")).toBe("take off");
    expect(normalizeSpelling("co-operate")).toBe("co-operate");
  });
});

describe("isSpellingCorrect", () => {
  test("matches ignoring surrounding whitespace and case", () => {
    expect(isSpellingCorrect("apple", "apple")).toBe(true);
    expect(isSpellingCorrect("  Apple ", "apple")).toBe(true);
    expect(isSpellingCorrect("APPLE", "Apple")).toBe(true);
  });

  test("does not match on different spelling", () => {
    expect(isSpellingCorrect("aple", "apple")).toBe(false);
    expect(isSpellingCorrect("", "apple")).toBe(false);
    expect(isSpellingCorrect("   ", "apple")).toBe(false);
  });

  test("inner spaces are significant (only surrounding whitespace is ignored)", () => {
    expect(isSpellingCorrect("take off", "take off")).toBe(true);
    expect(isSpellingCorrect("takeoff", "take off")).toBe(false);
  });
});
