import { describe, expect, test } from "vitest";

import { remainingOf } from "./use-question-timer";

describe("remainingOf", () => {
  test("full time remaining at start", () => {
    expect(remainingOf(5000, 0, 5000)).toEqual({ remainingRatio: 1, remainingSeconds: 5 });
  });

  test("halfway", () => {
    expect(remainingOf(5000, 2500, 5000)).toEqual({ remainingRatio: 0.5, remainingSeconds: 3 });
  });

  test("remainingSeconds is rounded up (0 only at expiry)", () => {
    expect(remainingOf(5000, 4999, 5000).remainingSeconds).toBe(1);
    expect(remainingOf(5000, 5000, 5000).remainingSeconds).toBe(0);
  });

  test("clamps to 0 after the deadline", () => {
    expect(remainingOf(5000, 6000, 5000)).toEqual({ remainingRatio: 0, remainingSeconds: 0 });
  });

  test("clamps to full when now precedes the start (clock anomaly)", () => {
    expect(remainingOf(5000, -100, 5000)).toEqual({ remainingRatio: 1, remainingSeconds: 5 });
  });
});
