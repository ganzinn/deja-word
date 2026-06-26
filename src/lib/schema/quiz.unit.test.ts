import { describe, expect, test } from "vitest";

import {
  answerInputSchema,
  getQuizPreviewInputSchema,
  quizFormatSchema,
  quizRangeInputSchema,
  saveQuizDefaultsInputSchema,
  startDrillInputSchema,
  startQuizInputSchema,
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

describe("quizFormatSchema", () => {
  test("accepts every quiz format (both directions)", () => {
    for (const f of [
      "CHOICE",
      "SELF_JUDGE",
      "MULTI_MEANING",
      "CHOICE_JA_EN",
      "SELF_JUDGE_JA_EN",
      "SPELLING",
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
        resetRemaining: 3,
        vagueRemaining: 2,
        initialCorrectRemaining: 1,
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

  test("timeoutSeconds accepts null and 1..60 integers, rejects out-of-range / non-integer / missing", () => {
    const base = {
      occurrenceId: "occ_1",
      format: "CHOICE",
      choiceFirstMeaningTextOnly: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
    } as const;
    for (const timeoutSeconds of [null, 1, 5, 60]) {
      expect(startQuizInputSchema.safeParse({ ...base, timeoutSeconds }).success).toBe(true);
    }
    for (const timeoutSeconds of [0, -1, 61, 2.5]) {
      expect(startQuizInputSchema.safeParse({ ...base, timeoutSeconds }).success).toBe(false);
    }
    expect(startQuizInputSchema.safeParse(base).success).toBe(false);
  });

  test("remaining counts are required integers in 1..9", () => {
    const base = {
      occurrenceId: "occ_1",
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
    } as const;
    expect(startQuizInputSchema.safeParse(base).success).toBe(true);
    for (const v of [1, 9]) {
      expect(startQuizInputSchema.safeParse({ ...base, resetRemaining: v }).success).toBe(true);
    }
    for (const v of [0, 10, 2.5, null]) {
      expect(startQuizInputSchema.safeParse({ ...base, resetRemaining: v }).success).toBe(false);
      expect(startQuizInputSchema.safeParse({ ...base, vagueRemaining: v }).success).toBe(false);
      expect(startQuizInputSchema.safeParse({ ...base, initialCorrectRemaining: v }).success).toBe(
        false,
      );
    }
    // 欠落も不正（required）
    expect(
      startQuizInputSchema.safeParse({
        occurrenceId: "occ_1",
        format: "CHOICE",
        timeoutSeconds: null,
        choiceFirstMeaningTextOnly: false,
        vagueRemaining: 2,
        initialCorrectRemaining: 1,
      }).success,
    ).toBe(false);
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
});
