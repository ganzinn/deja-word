import { describe, expect, test } from "vitest";

import {
  ALL_QUIZ_FORMATS,
  formatLabelOf,
  isFirstMeaningTextOnlyFormat,
  isJaToEnFormat,
  isSelfJudgeFormat,
  isTgExampleFormat,
} from "@/lib/quiz/format-options";
import type { QuizFormat } from "@/generated/prisma/enums";

describe("formatLabelOf", () => {
  test("向き（category）とラベルを併記する", () => {
    expect(formatLabelOf("CHOICE")).toBe("英語→日本語・四択");
    expect(formatLabelOf("SPELLING")).toBe("日本語→英語・スペル確認");
    expect(formatLabelOf("CHOICE_TG")).toBe("英語→日本語・TG四択");
    expect(formatLabelOf("CHOICE_TG_JA_EN")).toBe("日本語→英語・TG四択");
    expect(formatLabelOf("SELF_JUDGE_TG")).toBe("英語→日本語・TG自己判定");
    expect(formatLabelOf("SELF_JUDGE_TG_JA_EN")).toBe("日本語→英語・TG自己判定");
  });

  test("全形式でフォールバック（enum 値そのまま）に落ちない", () => {
    for (const format of ALL_QUIZ_FORMATS) {
      expect(formatLabelOf(format)).not.toBe(format);
      expect(formatLabelOf(format)).toContain("・");
    }
  });
});

describe("isSelfJudgeFormat", () => {
  test("自己判定（英→日・日→英・TG両向き）は true", () => {
    expect(isSelfJudgeFormat("SELF_JUDGE")).toBe(true);
    expect(isSelfJudgeFormat("SELF_JUDGE_JA_EN")).toBe(true);
    expect(isSelfJudgeFormat("SELF_JUDGE_TG")).toBe(true);
    expect(isSelfJudgeFormat("SELF_JUDGE_TG_JA_EN")).toBe(true);
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
  test("TG四択は日→英のみ true（英→日は英文が問題文に見えるため発音自動再生を抑止しない）", () => {
    expect(isJaToEnFormat("CHOICE_TG_JA_EN")).toBe(true);
    expect(isJaToEnFormat("CHOICE_TG")).toBe(false);
  });

  test("TG自己判定も日→英のみ true（英→日は英文が問題文に見えるため抑止しない）", () => {
    expect(isJaToEnFormat("SELF_JUDGE_TG_JA_EN")).toBe(true);
    expect(isJaToEnFormat("SELF_JUDGE_TG")).toBe(false);
  });
});

describe("isFirstMeaningTextOnlyFormat", () => {
  test("四択（英→日）と日本語→英語 3 形式のみ true（残りは訳語を表示しない／全訳語を出す）", () => {
    const targetFormats: QuizFormat[] = ["CHOICE", "CHOICE_JA_EN", "SELF_JUDGE_JA_EN", "SPELLING"];
    for (const format of targetFormats) {
      expect(isFirstMeaningTextOnlyFormat(format)).toBe(true);
    }
    const others = ALL_QUIZ_FORMATS.filter((f) => !targetFormats.includes(f));
    // 対象外は 6 形式（SELF_JUDGE / MULTI_MEANING / TG 4 種）。全 10 形式を網羅する。
    expect(others).toHaveLength(6);
    for (const format of others) {
      expect(isFirstMeaningTextOnlyFormat(format)).toBe(false);
    }
  });
});

describe("isTgExampleFormat", () => {
  test("TG 例文形式（四択・自己判定の両向き）のみ true", () => {
    const tgFormats: QuizFormat[] = [
      "CHOICE_TG",
      "CHOICE_TG_JA_EN",
      "SELF_JUDGE_TG",
      "SELF_JUDGE_TG_JA_EN",
    ];
    for (const format of tgFormats) {
      expect(isTgExampleFormat(format)).toBe(true);
    }
    for (const format of ALL_QUIZ_FORMATS.filter((f) => !tgFormats.includes(f))) {
      expect(isTgExampleFormat(format)).toBe(false);
    }
  });
});
