import { describe, expect, test } from "vitest";

import {
  INPUT_ID_MAX_LENGTH,
  QUIZ_ANSWERS_MAX_COUNT,
  answerInputSchema,
  getQuizPreviewInputSchema,
  quizFormatSchema,
  quizRangeInputSchema,
  saveQuizDefaultsInputSchema,
  startDrillInputSchema,
  startDrillRetryInputSchema,
  startQuizInputSchema,
  submitDrillRetryInputSchema,
  submitDrillRoundInputSchema,
  submitQuizAnswersInputSchema,
  wordIdSchema,
} from "@/lib/schema/quiz";

describe("quizRangeInputSchema", () => {
  test("accepts occurrenceId only (range omitted = unrestricted)", () => {
    const r = quizRangeInputSchema.safeParse({ occurrenceId: "occ_1" });
    expect(r.success).toBe(true);
  });

  test("accepts one-sided and both-sided ranges", () => {
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "occ_1", rangeFrom: 1 }).success).toBe(
      true,
    );
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "occ_1", rangeTo: 100 }).success).toBe(
      true,
    );
    expect(
      quizRangeInputSchema.safeParse({ occurrenceId: "occ_1", rangeFrom: 10, rangeTo: 20 }).success,
    ).toBe(true);
  });

  test("rejects empty occurrenceId / missing occurrenceId", () => {
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "" }).success).toBe(false);
    expect(quizRangeInputSchema.safeParse({}).success).toBe(false);
  });

  test("rejects zero and negative range values", () => {
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeFrom: 0 }).success).toBe(false);
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeFrom: -1 }).success).toBe(
      false,
    );
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeTo: -5 }).success).toBe(false);
  });

  test("rejects non-integer range values", () => {
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeFrom: 1.5 }).success).toBe(
      false,
    );
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeTo: 2.5 }).success).toBe(false);
  });

  test("rangeFrom > rangeTo is accepted by the schema (treated as 0 targets downstream)", () => {
    const r = quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeFrom: 20, rangeTo: 10 });
    expect(r.success).toBe(true);
  });
});

describe("quizRangeInputSchema bookmarkedOnly / cross-field (決定 1・3)", () => {
  test("bookmarkedOnly defaults to false when omitted", () => {
    const r = quizRangeInputSchema.safeParse({ occurrenceId: "occ_1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bookmarkedOnly).toBe(false);
  });

  test("掲載箇所指定 × bookmarkedOnly false/true = 従来どおり許可", () => {
    expect(
      quizRangeInputSchema.safeParse({ occurrenceId: "occ_1", bookmarkedOnly: false }).success,
    ).toBe(true);
    expect(
      quizRangeInputSchema.safeParse({ occurrenceId: "occ_1", bookmarkedOnly: true }).success,
    ).toBe(true);
  });

  test("全件モード: 掲載箇所未指定 × bookmarkedOnly true × 範囲なし = 許可", () => {
    const r = quizRangeInputSchema.safeParse({ bookmarkedOnly: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.occurrenceId).toBeUndefined();
  });

  test("掲載箇所未指定 × bookmarkedOnly false = 拒否（掲載箇所必須。省略時 false 扱いも同様）", () => {
    expect(quizRangeInputSchema.safeParse({ bookmarkedOnly: false }).success).toBe(false);
    expect(quizRangeInputSchema.safeParse({}).success).toBe(false);
  });

  test("掲載箇所未指定 × bookmarkedOnly true × 範囲あり = 拒否", () => {
    expect(quizRangeInputSchema.safeParse({ bookmarkedOnly: true, rangeFrom: 1 }).success).toBe(
      false,
    );
    expect(quizRangeInputSchema.safeParse({ bookmarkedOnly: true, rangeTo: 100 }).success).toBe(
      false,
    );
    expect(
      quizRangeInputSchema.safeParse({ bookmarkedOnly: true, rangeFrom: 1, rangeTo: 100 }).success,
    ).toBe(false);
  });

  test("クロスフィールド検証は extend 先へ自動波及する（決定 5）", () => {
    // getQuizPreviewInputSchema
    expect(getQuizPreviewInputSchema.safeParse({ bookmarkedOnly: true }).success).toBe(true);
    expect(getQuizPreviewInputSchema.safeParse({}).success).toBe(false);
    // startQuizInputSchema
    const startBase = {
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    } as const;
    expect(startQuizInputSchema.safeParse({ ...startBase, bookmarkedOnly: true }).success).toBe(
      true,
    );
    // 掲載箇所未指定 × bookmarkedOnly 省略（false）は拒否
    expect(startQuizInputSchema.safeParse({ ...startBase }).success).toBe(false);
  });
});

describe("quizFormatSchema", () => {
  test("accepts every quiz format (both directions)", () => {
    for (const f of [
      "CHOICE",
      "SELF_JUDGE",
      "MULTI_MEANING",
      "CHOICE_JA_EN",
      "SELF_JUDGE_JA_EN",
      "SPELLING",
      "CHOICE_TG",
      "CHOICE_TG_JA_EN",
      "SELF_JUDGE_TG",
      "SELF_JUDGE_TG_JA_EN",
    ]) {
      expect(quizFormatSchema.safeParse(f).success).toBe(true);
    }
  });

  test("rejects unknown formats", () => {
    expect(quizFormatSchema.safeParse("ESSAY").success).toBe(false);
    expect(quizFormatSchema.safeParse("choice").success).toBe(false);
  });
});

describe("answerInputSchema", () => {
  test("accepts wordId + result", () => {
    const r = answerInputSchema.safeParse({ wordId: "w_1", result: "CORRECT" });
    expect(r.success).toBe(true);
  });

  test("accepts all four result values", () => {
    for (const result of ["CORRECT", "INCORRECT", "GAVE_UP", "TIMEOUT"]) {
      expect(answerInputSchema.safeParse({ wordId: "w_1", result }).success).toBe(true);
    }
  });

  test("rejects unknown result values", () => {
    expect(answerInputSchema.safeParse({ wordId: "w_1", result: "MAYBE" }).success).toBe(false);
  });

  test("rejects empty wordId", () => {
    expect(answerInputSchema.safeParse({ wordId: "", result: "CORRECT" }).success).toBe(false);
  });
});

describe("getQuizPreviewInputSchema", () => {
  test("is the range input schema", () => {
    expect(getQuizPreviewInputSchema.safeParse({ occurrenceId: "occ_1" }).success).toBe(true);
  });
});

describe("startQuizInputSchema", () => {
  test("requires a format on top of the range input", () => {
    expect(
      startQuizInputSchema.safeParse({ occurrenceId: "occ_1", timeoutSeconds: null }).success,
    ).toBe(false);
    expect(
      startQuizInputSchema.safeParse({
        occurrenceId: "occ_1",
        format: "CHOICE",
        timeoutSeconds: null,
        choiceFirstMeaningTextOnly: false,
      }).success,
    ).toBe(true);
  });

  test("rejects an invalid format", () => {
    expect(
      startQuizInputSchema.safeParse({
        occurrenceId: "occ_1",
        format: "BOGUS",
        timeoutSeconds: null,
      }).success,
    ).toBe(false);
  });

  test("orderByOccurrenceNumber defaults to false when omitted and accepts a boolean", () => {
    const base = {
      occurrenceId: "occ_1",
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    } as const;
    // 省略時は `.default(false)` = ランダム出題（この項目を送らない旧フォームの後方互換）。
    const omitted = startQuizInputSchema.safeParse(base);
    expect(omitted.success).toBe(true);
    if (omitted.success) expect(omitted.data.orderByOccurrenceNumber).toBe(false);

    const on = startQuizInputSchema.safeParse({ ...base, orderByOccurrenceNumber: true });
    expect(on.success).toBe(true);
    if (on.success) expect(on.data.orderByOccurrenceNumber).toBe(true);

    expect(
      startQuizInputSchema.safeParse({ ...base, orderByOccurrenceNumber: "true" }).success,
    ).toBe(false);
  });

  test("timeoutSeconds accepts null and 1..60 integers, rejects out-of-range / non-integer / missing", () => {
    const base = {
      occurrenceId: "occ_1",
      format: "CHOICE",
      choiceFirstMeaningTextOnly: false,
    } as const;
    for (const timeoutSeconds of [null, 1, 5, 60]) {
      expect(startQuizInputSchema.safeParse({ ...base, timeoutSeconds }).success).toBe(true);
    }
    for (const timeoutSeconds of [0, -1, 61, 2.5]) {
      expect(startQuizInputSchema.safeParse({ ...base, timeoutSeconds }).success).toBe(false);
    }
    expect(startQuizInputSchema.safeParse(base).success).toBe(false);
  });

  // 定着までの回数（残数設定）は startQuiz の入力から外れ、`startDrillInputSchema` で受け取る
  // （テスト結果画面で設定し drill 開始時に渡す）。検証はそちらの describe を参照。

  test("questionCount is optional (omitted = 全問出題) and bounded to 1..QUIZ_ANSWERS_MAX_COUNT", () => {
    const base = {
      occurrenceId: "occ_1",
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    } as const;
    const omitted = startQuizInputSchema.safeParse(base);
    expect(omitted.success).toBe(true);
    if (omitted.success) expect(omitted.data.questionCount).toBeUndefined();
    for (const questionCount of [1, 20, QUIZ_ANSWERS_MAX_COUNT]) {
      expect(startQuizInputSchema.safeParse({ ...base, questionCount }).success).toBe(true);
    }
    for (const questionCount of [0, -1, 2.5, QUIZ_ANSWERS_MAX_COUNT + 1, null]) {
      expect(startQuizInputSchema.safeParse({ ...base, questionCount }).success).toBe(false);
    }
  });

  test("questionCount は掲載箇所に従属しない（全件モードでも指定できる）", () => {
    const r = startQuizInputSchema.safeParse({
      bookmarkedOnly: true,
      questionCount: 10,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    });
    expect(r.success).toBe(true);
  });
});

describe("submitQuizAnswersInputSchema", () => {
  test("accepts a top-level format and at least one answer", () => {
    const r = submitQuizAnswersInputSchema.safeParse({
      format: "SELF_JUDGE",
      answers: [
        { wordId: "w_1", result: "CORRECT" },
        { wordId: "w_2", result: "GAVE_UP" },
      ],
    });
    expect(r.success).toBe(true);
  });

  test("rejects empty answers", () => {
    expect(submitQuizAnswersInputSchema.safeParse({ format: "CHOICE", answers: [] }).success).toBe(
      false,
    );
  });

  test("rejects an answer with an invalid result", () => {
    const r = submitQuizAnswersInputSchema.safeParse({
      format: "CHOICE",
      answers: [
        { wordId: "w_1", result: "CORRECT" },
        { wordId: "w_2", result: "WRONG_VALUE" },
      ],
    });
    expect(r.success).toBe(false);
  });

  test("strips a per-answer format instead of accepting it", () => {
    const r = submitQuizAnswersInputSchema.parse({
      format: "CHOICE",
      answers: [{ wordId: "w_1", result: "CORRECT", format: "SELF_JUDGE" }],
    });
    expect(r.answers[0]).toEqual({ wordId: "w_1", result: "CORRECT" });
  });
});

describe("saveQuizDefaultsInputSchema", () => {
  // 全形式キーを持つ制限時間 map（指定分だけ秒数、残りは null）。
  const timeoutMap = (partial: Record<string, number>) => ({
    CHOICE: null,
    SELF_JUDGE: null,
    MULTI_MEANING: null,
    CHOICE_JA_EN: null,
    SELF_JUDGE_JA_EN: null,
    SPELLING: null,
    CHOICE_TG: null,
    CHOICE_TG_JA_EN: null,
    SELF_JUDGE_TG: null,
    SELF_JUDGE_TG_JA_EN: null,
    ...partial,
  });
  const ALL_NULL = timeoutMap({});

  test("accepts all-null (no defaults)", () => {
    const r = saveQuizDefaultsInputSchema.safeParse({
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    });
    expect(r.success).toBe(true);
  });

  test("accepts partial defaults (format only / occurrence only)", () => {
    expect(
      saveQuizDefaultsInputSchema.safeParse({
        occurrenceId: null,
        rangeFrom: null,
        rangeTo: null,
        format: "CHOICE",
        timeoutByFormat: ALL_NULL,
        showCountdown: null,
        autoplayPronunciation: null,
        enableAnswerSound: null,
        autoplayAnswerAudioJaEn: null,
        choiceFirstMeaningTextOnly: null,
        drillIncludeCorrect: null,
        resetRemaining: null,
        vagueRemaining: null,
        initialCorrectRemaining: null,
        saveOnStart: null,
      }).success,
    ).toBe(true);
    expect(
      saveQuizDefaultsInputSchema.safeParse({
        occurrenceId: "occ_1",
        rangeFrom: null,
        rangeTo: null,
        format: null,
        timeoutByFormat: ALL_NULL,
        showCountdown: null,
        autoplayPronunciation: null,
        enableAnswerSound: null,
        autoplayAnswerAudioJaEn: null,
        choiceFirstMeaningTextOnly: null,
        drillIncludeCorrect: null,
        resetRemaining: null,
        vagueRemaining: null,
        initialCorrectRemaining: null,
        saveOnStart: null,
      }).success,
    ).toBe(true);
  });

  test("accepts fully specified defaults (per-format timeouts)", () => {
    const r = saveQuizDefaultsInputSchema.safeParse({
      occurrenceId: "occ_1",
      rangeFrom: 1,
      rangeTo: 100,
      format: "SELF_JUDGE",
      timeoutByFormat: timeoutMap({ CHOICE: 5, SELF_JUDGE: 20, MULTI_MEANING: 30 }),
      showCountdown: false,
      autoplayPronunciation: true,
      enableAnswerSound: true,
      autoplayAnswerAudioJaEn: true,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: true,
    });
    expect(r.success).toBe(true);
  });

  test("timeoutByFormat: each format accepts null and 1..60 integers, rejects out-of-range / non-integer", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const v of [null, 1, 60]) {
      expect(
        saveQuizDefaultsInputSchema.safeParse({
          ...base,
          timeoutByFormat: timeoutMap(v === null ? {} : { CHOICE: v }),
        }).success,
      ).toBe(true);
    }
    for (const v of [0, 61, 2.5]) {
      expect(
        saveQuizDefaultsInputSchema.safeParse({
          ...base,
          timeoutByFormat: timeoutMap({ CHOICE: v }),
        }).success,
      ).toBe(false);
    }
  });

  test("timeoutByFormat requires all format keys (rejects a missing key)", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    // SELF_JUDGE / MULTI_MEANING を欠いた map は不正
    expect(
      saveQuizDefaultsInputSchema.safeParse({ ...base, timeoutByFormat: { CHOICE: 5 } }).success,
    ).toBe(false);
    // timeoutByFormat 自体の欠落も不正
    expect(saveQuizDefaultsInputSchema.safeParse(base).success).toBe(false);
  });

  test("rejects empty occurrenceId (null is the way to unset)", () => {
    expect(
      saveQuizDefaultsInputSchema.safeParse({
        occurrenceId: "",
        rangeFrom: null,
        rangeTo: null,
        format: null,
        timeoutByFormat: ALL_NULL,
        showCountdown: null,
        autoplayPronunciation: null,
        enableAnswerSound: null,
        autoplayAnswerAudioJaEn: null,
        choiceFirstMeaningTextOnly: null,
        drillIncludeCorrect: null,
        resetRemaining: null,
        vagueRemaining: null,
        initialCorrectRemaining: null,
        saveOnStart: null,
      }).success,
    ).toBe(false);
  });

  test("rejects zero / negative / non-integer range values", () => {
    for (const rangeFrom of [0, -1, 1.5]) {
      expect(
        saveQuizDefaultsInputSchema.safeParse({
          occurrenceId: null,
          rangeFrom,
          rangeTo: null,
          format: null,
          timeoutByFormat: ALL_NULL,
          showCountdown: null,
          autoplayPronunciation: null,
          enableAnswerSound: null,
          autoplayAnswerAudioJaEn: null,
          choiceFirstMeaningTextOnly: null,
          drillIncludeCorrect: null,
          saveOnStart: null,
        }).success,
      ).toBe(false);
    }
  });

  test("rejects an invalid format", () => {
    expect(
      saveQuizDefaultsInputSchema.safeParse({
        occurrenceId: null,
        rangeFrom: null,
        rangeTo: null,
        format: "BOGUS",
        timeoutByFormat: ALL_NULL,
        showCountdown: null,
        autoplayPronunciation: null,
        enableAnswerSound: null,
        autoplayAnswerAudioJaEn: null,
        choiceFirstMeaningTextOnly: null,
        drillIncludeCorrect: null,
        resetRemaining: null,
        vagueRemaining: null,
        initialCorrectRemaining: null,
        saveOnStart: null,
      }).success,
    ).toBe(false);
  });

  test("showCountdown accepts true / false / null, rejects non-boolean / missing", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const showCountdown of [true, false, null]) {
      expect(saveQuizDefaultsInputSchema.safeParse({ ...base, showCountdown }).success).toBe(true);
    }
    expect(saveQuizDefaultsInputSchema.safeParse({ ...base, showCountdown: "true" }).success).toBe(
      false,
    );
    expect(saveQuizDefaultsInputSchema.safeParse(base).success).toBe(false);
  });

  test("autoplayPronunciation accepts true / false / null, rejects non-boolean / missing", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const autoplayPronunciation of [true, false, null]) {
      expect(
        saveQuizDefaultsInputSchema.safeParse({ ...base, autoplayPronunciation }).success,
      ).toBe(true);
    }
    expect(
      saveQuizDefaultsInputSchema.safeParse({ ...base, autoplayPronunciation: "true" }).success,
    ).toBe(false);
    expect(saveQuizDefaultsInputSchema.safeParse(base).success).toBe(false);
  });

  test("enableAnswerSound accepts true / false / null, rejects non-boolean / missing", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const enableAnswerSound of [true, false, null]) {
      expect(saveQuizDefaultsInputSchema.safeParse({ ...base, enableAnswerSound }).success).toBe(
        true,
      );
    }
    expect(
      saveQuizDefaultsInputSchema.safeParse({ ...base, enableAnswerSound: "true" }).success,
    ).toBe(false);
    expect(saveQuizDefaultsInputSchema.safeParse(base).success).toBe(false);
  });

  test("autoplayAnswerAudioJaEn accepts true / false / null, rejects non-boolean / missing", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const autoplayAnswerAudioJaEn of [true, false, null]) {
      expect(
        saveQuizDefaultsInputSchema.safeParse({ ...base, autoplayAnswerAudioJaEn }).success,
      ).toBe(true);
    }
    expect(
      saveQuizDefaultsInputSchema.safeParse({ ...base, autoplayAnswerAudioJaEn: "true" }).success,
    ).toBe(false);
    expect(saveQuizDefaultsInputSchema.safeParse(base).success).toBe(false);
  });

  test("choiceFirstMeaningTextOnly accepts true / false / null, rejects non-boolean / missing", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const choiceFirstMeaningTextOnly of [true, false, null]) {
      expect(
        saveQuizDefaultsInputSchema.safeParse({ ...base, choiceFirstMeaningTextOnly }).success,
      ).toBe(true);
    }
    expect(
      saveQuizDefaultsInputSchema.safeParse({ ...base, choiceFirstMeaningTextOnly: "true" })
        .success,
    ).toBe(false);
    expect(saveQuizDefaultsInputSchema.safeParse(base).success).toBe(false);
  });

  test("drillIncludeCorrect accepts true / false / null, rejects non-boolean / missing", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const drillIncludeCorrect of [true, false, null]) {
      expect(saveQuizDefaultsInputSchema.safeParse({ ...base, drillIncludeCorrect }).success).toBe(
        true,
      );
    }
    expect(
      saveQuizDefaultsInputSchema.safeParse({ ...base, drillIncludeCorrect: "true" }).success,
    ).toBe(false);
    expect(saveQuizDefaultsInputSchema.safeParse(base).success).toBe(false);
  });

  test("rangeFrom > rangeTo is accepted by the schema (treated as 0 targets downstream)", () => {
    const r = saveQuizDefaultsInputSchema.safeParse({
      occurrenceId: null,
      rangeFrom: 20,
      rangeTo: 10,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    });
    expect(r.success).toBe(true);
  });

  test("bookmarkedOnly accepts true / false / null, defaults to null when omitted, rejects non-boolean", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const bookmarkedOnly of [true, false, null]) {
      expect(saveQuizDefaultsInputSchema.safeParse({ ...base, bookmarkedOnly }).success).toBe(true);
    }
    // 省略時は `.default(null)` で null が補われる（設定フォーム未更新の後方互換）。
    const r = saveQuizDefaultsInputSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bookmarkedOnly).toBeNull();
    expect(saveQuizDefaultsInputSchema.safeParse({ ...base, bookmarkedOnly: "true" }).success).toBe(
      false,
    );
  });

  test("orderByOccurrenceNumber accepts true / false / null, defaults to null when omitted, rejects non-boolean", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const orderByOccurrenceNumber of [true, false, null]) {
      expect(
        saveQuizDefaultsInputSchema.safeParse({ ...base, orderByOccurrenceNumber }).success,
      ).toBe(true);
    }
    // 省略時は `.default(null)` で null が補われる（この項目を送らない旧フォームの後方互換）。
    const r = saveQuizDefaultsInputSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.orderByOccurrenceNumber).toBeNull();
    expect(
      saveQuizDefaultsInputSchema.safeParse({ ...base, orderByOccurrenceNumber: "true" }).success,
    ).toBe(false);
  });

  test("questionCount accepts null / 1..QUIZ_ANSWERS_MAX_COUNT, defaults to null when omitted, rejects out-of-range", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const questionCount of [null, 1, 20, QUIZ_ANSWERS_MAX_COUNT]) {
      expect(saveQuizDefaultsInputSchema.safeParse({ ...base, questionCount }).success).toBe(true);
    }
    for (const questionCount of [0, -1, 2.5, QUIZ_ANSWERS_MAX_COUNT + 1]) {
      expect(saveQuizDefaultsInputSchema.safeParse({ ...base, questionCount }).success).toBe(false);
    }
    // 省略時は `.default(null)` で null が補われる（この項目を送らない旧フォームの後方互換）。
    const r = saveQuizDefaultsInputSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.questionCount).toBeNull();
  });

  test("saveOnStart accepts true / false / null, rejects non-boolean / missing", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      resetRemaining: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
    };
    for (const saveOnStart of [true, false, null]) {
      expect(saveQuizDefaultsInputSchema.safeParse({ ...base, saveOnStart }).success).toBe(true);
    }
    expect(saveQuizDefaultsInputSchema.safeParse({ ...base, saveOnStart: "true" }).success).toBe(
      false,
    );
    expect(saveQuizDefaultsInputSchema.safeParse(base).success).toBe(false);
  });

  test("remaining counts accept null and 1..9 integers, reject out-of-range / non-integer / missing", () => {
    const base = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: ALL_NULL,
      showCountdown: null,
      autoplayPronunciation: null,
      enableAnswerSound: null,
      autoplayAnswerAudioJaEn: null,
      choiceFirstMeaningTextOnly: null,
      drillIncludeCorrect: null,
      vagueRemaining: null,
      initialCorrectRemaining: null,
      saveOnStart: null,
    };
    for (const resetRemaining of [null, 1, 9]) {
      expect(saveQuizDefaultsInputSchema.safeParse({ ...base, resetRemaining }).success).toBe(true);
    }
    for (const resetRemaining of [0, 10, 2.5]) {
      expect(saveQuizDefaultsInputSchema.safeParse({ ...base, resetRemaining }).success).toBe(
        false,
      );
    }
    // 欠落は不正（キーは必須、値が nullable）
    expect(saveQuizDefaultsInputSchema.safeParse(base).success).toBe(false);
  });
});

describe("startDrillInputSchema", () => {
  test("timeoutSeconds is required (nullable) and bounded to 1..60", () => {
    const base = {
      occurrenceId: "occ_1",
      format: "CHOICE",
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [{ wordId: "w_1", result: "CORRECT" }],
    };
    expect(startDrillInputSchema.safeParse(base).success).toBe(false);
    for (const timeoutSeconds of [null, 1, 60]) {
      expect(startDrillInputSchema.safeParse({ ...base, timeoutSeconds }).success).toBe(true);
    }
    for (const timeoutSeconds of [0, 61, 2.5]) {
      expect(startDrillInputSchema.safeParse({ ...base, timeoutSeconds }).success).toBe(false);
    }
  });

  test("drillIncludeCorrect is a required boolean", () => {
    const base = {
      occurrenceId: "occ_1",
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [{ wordId: "w_1", result: "CORRECT" }],
    };
    // 欠落は不正（nullable でも optional でもない）
    expect(startDrillInputSchema.safeParse(base).success).toBe(false);
    for (const drillIncludeCorrect of [true, false]) {
      expect(startDrillInputSchema.safeParse({ ...base, drillIncludeCorrect }).success).toBe(true);
    }
    expect(startDrillInputSchema.safeParse({ ...base, drillIncludeCorrect: null }).success).toBe(
      false,
    );
  });

  test("occurrenceId optional (全件モード drill) and sourceBookmarkedOnly defaults to false", () => {
    const base = {
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [{ wordId: "w_1", result: "INCORRECT" }],
    } as const;
    // 掲載箇所なし（ブックマーク全件モードの元テスト由来）も受理する。startDrill 側にクロスフィールド検証はない。
    const r = startDrillInputSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.occurrenceId).toBeUndefined();
      expect(r.data.sourceBookmarkedOnly).toBe(false);
    }
    const r2 = startDrillInputSchema.safeParse({
      ...base,
      occurrenceId: "occ_1",
      sourceBookmarkedOnly: true,
    });
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.sourceBookmarkedOnly).toBe(true);
  });

  test("sourceQuestionCount is optional (省略 = 元テストが出題数指定なし) and bounded to 1..QUIZ_ANSWERS_MAX_COUNT", () => {
    const base = {
      occurrenceId: "occ_1",
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [{ wordId: "w_1", result: "CORRECT" }],
    } as const;
    const omitted = startDrillInputSchema.safeParse(base);
    expect(omitted.success).toBe(true);
    if (omitted.success) expect(omitted.data.sourceQuestionCount).toBeUndefined();
    for (const sourceQuestionCount of [1, QUIZ_ANSWERS_MAX_COUNT]) {
      expect(startDrillInputSchema.safeParse({ ...base, sourceQuestionCount }).success).toBe(true);
    }
    for (const sourceQuestionCount of [0, 2.5, QUIZ_ANSWERS_MAX_COUNT + 1, null]) {
      expect(startDrillInputSchema.safeParse({ ...base, sourceQuestionCount }).success).toBe(false);
    }
  });

  test("remaining counts are required integers in 1..9", () => {
    const base = {
      occurrenceId: "occ_1",
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [{ wordId: "w_1", result: "CORRECT" }],
    };
    expect(startDrillInputSchema.safeParse(base).success).toBe(true);
    for (const v of [0, 10, 2.5, null]) {
      expect(startDrillInputSchema.safeParse({ ...base, resetRemaining: v }).success).toBe(false);
      expect(startDrillInputSchema.safeParse({ ...base, vagueRemaining: v }).success).toBe(false);
      expect(startDrillInputSchema.safeParse({ ...base, initialCorrectRemaining: v }).success).toBe(
        false,
      );
    }
  });
});

describe("wordIdSchema", () => {
  test("accepts a non-empty id and rejects an empty one", () => {
    expect(wordIdSchema.safeParse("w_1").success).toBe(true);
    expect(wordIdSchema.safeParse("").success).toBe(false);
  });

  test("accepts a real cuid and ids up to INPUT_ID_MAX_LENGTH, rejects over-length ids", () => {
    expect(wordIdSchema.safeParse("cjld2cjxh0000qzrmn831i7rn").success).toBe(true);
    expect(wordIdSchema.safeParse("a".repeat(INPUT_ID_MAX_LENGTH)).success).toBe(true);
    expect(wordIdSchema.safeParse("a".repeat(INPUT_ID_MAX_LENGTH + 1)).success).toBe(false);
  });
});

describe("answers/results array max limits (issue #107)", () => {
  const answers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ wordId: `w_${i}`, result: "CORRECT" as const }));

  test("submitQuizAnswers accepts exactly QUIZ_ANSWERS_MAX_COUNT answers", () => {
    const r = submitQuizAnswersInputSchema.safeParse({
      format: "CHOICE",
      answers: answers(QUIZ_ANSWERS_MAX_COUNT),
    });
    expect(r.success).toBe(true);
  });

  test("submitQuizAnswers rejects answers over QUIZ_ANSWERS_MAX_COUNT", () => {
    const r = submitQuizAnswersInputSchema.safeParse({
      format: "CHOICE",
      answers: answers(QUIZ_ANSWERS_MAX_COUNT + 1),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "answers")).toBe(true);
    }
  });

  test("startDrill rejects results over QUIZ_ANSWERS_MAX_COUNT", () => {
    const r = startDrillInputSchema.safeParse({
      occurrenceId: "occ_1",
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: answers(QUIZ_ANSWERS_MAX_COUNT + 1),
    });
    expect(r.success).toBe(false);
  });

  test("submitDrillRound rejects answers over QUIZ_ANSWERS_MAX_COUNT", () => {
    const r = submitDrillRoundInputSchema.safeParse({
      drillId: "d_1",
      expectedRoundCount: 0,
      answers: answers(QUIZ_ANSWERS_MAX_COUNT + 1),
    });
    expect(r.success).toBe(false);
  });

  test("submitDrillRetry rejects answers over QUIZ_ANSWERS_MAX_COUNT", () => {
    const r = submitDrillRetryInputSchema.safeParse({
      drillId: "d_1",
      answers: answers(QUIZ_ANSWERS_MAX_COUNT + 1),
    });
    expect(r.success).toBe(false);
  });

  test("startDrillRetry rejects wordIds over QUIZ_ANSWERS_MAX_COUNT", () => {
    const r = startDrillRetryInputSchema.safeParse({
      drillId: "d_1",
      wordIds: Array.from({ length: QUIZ_ANSWERS_MAX_COUNT + 1 }, (_, i) => `w_${i}`),
    });
    expect(r.success).toBe(false);
  });
});
