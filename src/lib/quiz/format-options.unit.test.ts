import { describe, expect, test } from "vitest";

import { ALL_QUIZ_FORMATS, formatLabelOf } from "@/lib/quiz/format-options";

describe("formatLabelOf", () => {
  test("向き（category）とラベルを併記する", () => {
    expect(formatLabelOf("CHOICE")).toBe("英語→日本語・四択");
    expect(formatLabelOf("SPELLING")).toBe("日本語→英語・スペル確認");
  });

  test("全形式でフォールバック（enum 値そのまま）に落ちない", () => {
    for (const format of ALL_QUIZ_FORMATS) {
      expect(formatLabelOf(format)).not.toBe(format);
      expect(formatLabelOf(format)).toContain("・");
    }
  });
});
