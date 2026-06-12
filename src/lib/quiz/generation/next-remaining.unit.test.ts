import { describe, expect, test } from "vitest";

import { nextRemaining } from "@/lib/quiz/generation/next-remaining";

describe("nextRemaining", () => {
  test("CORRECT decrements by 1", () => {
    expect(nextRemaining(3, "CORRECT")).toBe(2);
    expect(nextRemaining(2, "CORRECT")).toBe(1);
    expect(nextRemaining(1, "CORRECT")).toBe(0); // 卒業
  });

  test("CORRECT clamps at the lower bound 0", () => {
    expect(nextRemaining(0, "CORRECT")).toBe(0);
  });

  test("INCORRECT resets to 3 from any value (boundaries 0 and 3 included)", () => {
    expect(nextRemaining(0, "INCORRECT")).toBe(3);
    expect(nextRemaining(1, "INCORRECT")).toBe(3);
    expect(nextRemaining(3, "INCORRECT")).toBe(3);
  });

  test("GAVE_UP resets to 3 like INCORRECT (boundaries 0 and 3 included)", () => {
    expect(nextRemaining(0, "GAVE_UP")).toBe(3);
    expect(nextRemaining(2, "GAVE_UP")).toBe(3);
    expect(nextRemaining(3, "GAVE_UP")).toBe(3);
  });
});
