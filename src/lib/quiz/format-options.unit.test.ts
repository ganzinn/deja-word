import { describe, expect, test } from "vitest";

import {
  ALL_QUIZ_FORMATS,
  formatLabelOf,
  isJaToEnFormat,
  isSelfJudgeFormat,
  isTgExampleFormat,
} from "@/lib/quiz/format-options";

describe("formatLabelOf", () => {
  test("向き（category）とラベルを併記する", () => {
    expect(formatLabelOf("CHOICE")).toBe("英語→日本語・四択");
    expect(formatLabelOf("SPELLING")).toBe("日本語→英語・スペル確認");
    expect(formatLabelOf("CHOICE_TG")).toBe("英語→日本語・例文四択");
    expect(formatLabelOf("CHOICE_TG_JA_EN")).toBe("日本語→英語・例文四択");
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
    expect(isSelfJudgeFormat("CHOICE_TG")).toBe(false);
    expect(isSelfJudgeFormat("CHOICE_TG_JA_EN")).toBe(false);
  });
});

describe("isJaToEnFormat", () => {
  test("例文四択は日→英のみ true（英→日は英文が問題文に見えるため発音自動再生を抑止しない）", () => {
    expect(isJaToEnFormat("CHOICE_TG_JA_EN")).toBe(true);
    expect(isJaToEnFormat("CHOICE_TG")).toBe(false);
  });
});

describe("isTgExampleFormat", () => {
  test("TG 例文形式（両向き）のみ true", () => {
    expect(isTgExampleFormat("CHOICE_TG")).toBe(true);
    expect(isTgExampleFormat("CHOICE_TG_JA_EN")).toBe(true);
    for (const format of ALL_QUIZ_FORMATS.filter(
      (f) => f !== "CHOICE_TG" && f !== "CHOICE_TG_JA_EN",
    )) {
      expect(isTgExampleFormat(format)).toBe(false);
    }
  });
});
