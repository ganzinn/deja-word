import { describe, expect, test } from "vitest";

import {
  DEFAULT_DRILL_REMAINING_CONFIG,
  type DrillRemainingConfig,
  initialRemaining,
  nextRemaining,
} from "@/lib/quiz/generation/next-remaining";

const D = DEFAULT_DRILL_REMAINING_CONFIG;

describe("nextRemaining (default config 誤答3 / うろ覚え2 / 正答1)", () => {
  test("CORRECT decrements by 1", () => {
    expect(nextRemaining(3, "CORRECT", D)).toBe(2);
    expect(nextRemaining(2, "CORRECT", D)).toBe(1);
    expect(nextRemaining(1, "CORRECT", D)).toBe(0); // 定着
  });

  test("CORRECT clamps at the lower bound 0", () => {
    expect(nextRemaining(0, "CORRECT", D)).toBe(0);
  });

  test("VAGUE (うろ覚え) resets to 2 from any value（正解1・不正解3の中間）", () => {
    expect(nextRemaining(0, "VAGUE", D)).toBe(2);
    expect(nextRemaining(1, "VAGUE", D)).toBe(2);
    expect(nextRemaining(3, "VAGUE", D)).toBe(2);
  });

  test("INCORRECT resets to 3 from any value (boundaries 0 and 3 included)", () => {
    expect(nextRemaining(0, "INCORRECT", D)).toBe(3);
    expect(nextRemaining(1, "INCORRECT", D)).toBe(3);
    expect(nextRemaining(3, "INCORRECT", D)).toBe(3);
  });

  test("GAVE_UP resets to 3 like INCORRECT (boundaries 0 and 3 included)", () => {
    expect(nextRemaining(0, "GAVE_UP", D)).toBe(3);
    expect(nextRemaining(2, "GAVE_UP", D)).toBe(3);
    expect(nextRemaining(3, "GAVE_UP", D)).toBe(3);
  });

  test("TIMEOUT resets to 3 like INCORRECT (boundaries 0 and 3 included)", () => {
    expect(nextRemaining(0, "TIMEOUT", D)).toBe(3);
    expect(nextRemaining(2, "TIMEOUT", D)).toBe(3);
    expect(nextRemaining(3, "TIMEOUT", D)).toBe(3);
  });
});

describe("nextRemaining (custom config)", () => {
  const custom: DrillRemainingConfig = {
    resetRemaining: 5,
    vagueRemaining: 4,
    initialCorrectRemaining: 2,
  };

  test("CORRECT still decrements by 1 regardless of config", () => {
    expect(nextRemaining(5, "CORRECT", custom)).toBe(4);
    expect(nextRemaining(1, "CORRECT", custom)).toBe(0);
  });

  test("VAGUE resets to the configured vagueRemaining", () => {
    expect(nextRemaining(0, "VAGUE", custom)).toBe(4);
    expect(nextRemaining(5, "VAGUE", custom)).toBe(4);
  });

  test("INCORRECT / GAVE_UP / TIMEOUT reset to the configured resetRemaining", () => {
    expect(nextRemaining(0, "INCORRECT", custom)).toBe(5);
    expect(nextRemaining(2, "GAVE_UP", custom)).toBe(5);
    expect(nextRemaining(9, "TIMEOUT", custom)).toBe(5);
  });
});

describe("initialRemaining", () => {
  test("default config: 誤答=3 / うろ覚え=2 / 正答=1", () => {
    expect(initialRemaining("INCORRECT", D)).toBe(3);
    expect(initialRemaining("GAVE_UP", D)).toBe(3);
    expect(initialRemaining("TIMEOUT", D)).toBe(3);
    expect(initialRemaining("VAGUE", D)).toBe(2);
    expect(initialRemaining("CORRECT", D)).toBe(1);
  });

  test("custom config maps each result to its configured initial value", () => {
    const custom: DrillRemainingConfig = {
      resetRemaining: 5,
      vagueRemaining: 4,
      initialCorrectRemaining: 2,
    };
    expect(initialRemaining("INCORRECT", custom)).toBe(5);
    expect(initialRemaining("VAGUE", custom)).toBe(4);
    expect(initialRemaining("CORRECT", custom)).toBe(2);
  });
});
