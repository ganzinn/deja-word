import { describe, expect, test } from "vitest";

import { ALL_QUIZ_FORMATS, formatLabelOf, isSelfJudgeFormat } from "@/lib/quiz/format-options";

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

describe("isSelfJudgeFormat", () => {
  test("自己判定（英→日・日→英）は true", () => {
    expect(isSelfJudgeFormat("SELF_JUDGE")).toBe(true);
    expect(isSelfJudgeFormat("SELF_JUDGE_JA_EN")).toBe(true);
  });

  test("自己判定以外の形式は false", () => {
    expect(isSelfJudgeFormat("CHOICE")).toBe(false);
    expect(isSelfJudgeFormat("CHOICE_JA_EN")).toBe(false);
    expect(isSelfJudgeFormat("MULTI_MEANING")).toBe(false);
    expect(isSelfJudgeFormat("SPELLING")).toBe(false);
  });
});
