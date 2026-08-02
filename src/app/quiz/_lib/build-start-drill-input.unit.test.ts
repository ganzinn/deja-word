import { describe, expect, test } from "vitest";

import { startDrillInputSchema } from "@/lib/schema/quiz";

import { buildStartDrillInput } from "./build-start-drill-input";

// 元テスト（掲載箇所あり × 範囲あり）の代表的な開始入力。各テストで必要な項目だけ上書きする。
const baseParams = {
  startInput: {
    occurrenceId: "occ_1",
    rangeFrom: 1,
    rangeTo: 100,
    bookmarkedOnly: false,
    questionCount: 20,
    format: "CHOICE" as const,
    timeoutSeconds: 10,
    choiceFirstMeaningTextOnly: true,
    orderByOccurrenceNumber: true,
  },
  quiz: { format: "CHOICE" as const, timeoutSeconds: 10 },
  drillIncludeCorrect: false,
  resetRemaining: 3,
  vagueRemaining: 2,
  initialCorrectRemaining: 1,
  results: [
    { wordId: "w_1", result: "INCORRECT" as const },
    { wordId: "w_2", result: "CORRECT" as const },
  ],
};

describe("buildStartDrillInput", () => {
  test("元テストの範囲・出題設定・結果画面の設定をすべて引き継ぐ", () => {
    const input = buildStartDrillInput(baseParams);
    expect(input).toEqual({
      occurrenceId: "occ_1",
      sourceRangeFrom: 1,
      sourceRangeTo: 100,
      sourceBookmarkedOnly: false,
      sourceQuestionCount: 20,
      format: "CHOICE",
      timeoutSeconds: 10,
      choiceFirstMeaningTextOnly: true,
      orderByOccurrenceNumber: true,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: baseParams.results,
    });
    // 組み立て結果は startDrill の入力スキーマをそのまま満たす
    expect(startDrillInputSchema.safeParse(input).success).toBe(true);
  });

  test("「ブックマークのみ」の元テストは sourceBookmarkedOnly=true で引き継ぐ（issue #144 回帰）", () => {
    const input = buildStartDrillInput({
      ...baseParams,
      startInput: { ...baseParams.startInput, bookmarkedOnly: true },
    });
    // 渡し忘れるとスキーマの `.default(false)` が補われ、再テスト導線の絞り込みと
    // 進行中一覧の「（ブックマークのみ）」注記が失われる。パース後の値まで検証する。
    const parsed = startDrillInputSchema.parse(input);
    expect(parsed.sourceBookmarkedOnly).toBe(true);
  });

  test("全件モード（掲載箇所なし × ブックマークのみ）は occurrenceId・範囲なしで引き継ぐ", () => {
    const input = buildStartDrillInput({
      ...baseParams,
      startInput: {
        bookmarkedOnly: true,
        format: "CHOICE" as const,
        timeoutSeconds: null,
        choiceFirstMeaningTextOnly: false,
        orderByOccurrenceNumber: false,
      },
      quiz: { format: "CHOICE" as const, timeoutSeconds: null },
    });
    const parsed = startDrillInputSchema.parse(input);
    expect(parsed.occurrenceId).toBeUndefined();
    expect(parsed.sourceRangeFrom).toBeUndefined();
    expect(parsed.sourceRangeTo).toBeUndefined();
    expect(parsed.sourceBookmarkedOnly).toBe(true);
  });

  test("出題数指定の元テストは sourceQuestionCount で引き継ぎ、未指定は undefined のまま", () => {
    // 渡し忘れるとスキーマの optional に吸収されて型では検出できず、再テストが全問出題に化ける
    // （sourceBookmarkedOnly の issue #144 と同型）。パース後の値まで検証する。
    const withCount = startDrillInputSchema.parse(buildStartDrillInput(baseParams));
    expect(withCount.sourceQuestionCount).toBe(20);

    const withoutCount = startDrillInputSchema.parse(
      buildStartDrillInput({
        ...baseParams,
        startInput: { ...baseParams.startInput, questionCount: undefined },
      }),
    );
    expect(withoutCount.sourceQuestionCount).toBeUndefined();
  });

  test("bookmarkedOnly 未指定（後方互換の省略入力）はスキーマの default で false になる", () => {
    const input = buildStartDrillInput({
      ...baseParams,
      startInput: { ...baseParams.startInput, bookmarkedOnly: undefined },
    });
    const parsed = startDrillInputSchema.parse(input);
    expect(parsed.sourceBookmarkedOnly).toBe(false);
  });
});
