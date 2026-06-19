import { describe, expect, test } from "vitest";

import { formatTimeoutLabel } from "@/lib/quiz/timeout-options";

describe("formatTimeoutLabel", () => {
  test("秒数ありは「制限 N 秒」", () => {
    expect(formatTimeoutLabel(5)).toBe("制限 5 秒");
    expect(formatTimeoutLabel(60)).toBe("制限 60 秒");
  });

  test("null は「制限なし」", () => {
    expect(formatTimeoutLabel(null)).toBe("制限なし");
  });
});
