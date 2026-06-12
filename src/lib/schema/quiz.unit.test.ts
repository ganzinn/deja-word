import { describe, expect, test } from "vitest";

import {
  answerInputSchema,
  getQuizPreviewInputSchema,
  quizFormatSchema,
  quizRangeInputSchema,
  saveQuizDefaultsInputSchema,
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
      quizRangeInputSchema.safeParse({ occurrenceId: "occ_1", rangeFrom: 10, rangeTo: 20 })
        .success,
    ).toBe(true);
  });

  test("rejects empty occurrenceId / missing occurrenceId", () => {
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "" }).success).toBe(false);
    expect(quizRangeInputSchema.safeParse({}).success).toBe(false);
  });

  test("rejects zero and negative range values", () => {
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeFrom: 0 }).success).toBe(
      false,
    );
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeFrom: -1 }).success).toBe(
      false,
    );
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeTo: -5 }).success).toBe(false);
  });

  test("rejects non-integer range values", () => {
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeFrom: 1.5 }).success).toBe(
      false,
    );
    expect(quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeTo: 2.5 }).success).toBe(
      false,
    );
  });

  test("rangeFrom > rangeTo is accepted by the schema (treated as 0 targets downstream)", () => {
    const r = quizRangeInputSchema.safeParse({ occurrenceId: "o", rangeFrom: 20, rangeTo: 10 });
    expect(r.success).toBe(true);
  });
});

describe("quizFormatSchema", () => {
  test("accepts the three quiz formats", () => {
    for (const f of ["CHOICE", "SELF_JUDGE", "MULTI_MEANING"]) {
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
    expect(startQuizInputSchema.safeParse({ occurrenceId: "occ_1" }).success).toBe(false);
    expect(
      startQuizInputSchema.safeParse({ occurrenceId: "occ_1", format: "CHOICE" }).success,
    ).toBe(true);
  });

  test("rejects an invalid format", () => {
    expect(
      startQuizInputSchema.safeParse({ occurrenceId: "occ_1", format: "BOGUS" }).success,
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
    expect(
      submitQuizAnswersInputSchema.safeParse({ format: "CHOICE", answers: [] }).success,
    ).toBe(false);
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
  test("accepts all-null (no defaults)", () => {
    const r = saveQuizDefaultsInputSchema.safeParse({
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
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
      }).success,
    ).toBe(true);
    expect(
      saveQuizDefaultsInputSchema.safeParse({
        occurrenceId: "occ_1",
        rangeFrom: null,
        rangeTo: null,
        format: null,
      }).success,
    ).toBe(true);
  });

  test("accepts fully specified defaults", () => {
    const r = saveQuizDefaultsInputSchema.safeParse({
      occurrenceId: "occ_1",
      rangeFrom: 1,
      rangeTo: 100,
      format: "SELF_JUDGE",
    });
    expect(r.success).toBe(true);
  });

  test("rejects empty occurrenceId (null is the way to unset)", () => {
    expect(
      saveQuizDefaultsInputSchema.safeParse({
        occurrenceId: "",
        rangeFrom: null,
        rangeTo: null,
        format: null,
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
      }).success,
    ).toBe(false);
  });

  test("rangeFrom > rangeTo is accepted by the schema (treated as 0 targets downstream)", () => {
    const r = saveQuizDefaultsInputSchema.safeParse({
      occurrenceId: null,
      rangeFrom: 20,
      rangeTo: 10,
      format: null,
    });
    expect(r.success).toBe(true);
  });
});

describe("wordIdSchema", () => {
  test("accepts a non-empty id and rejects an empty one", () => {
    expect(wordIdSchema.safeParse("w_1").success).toBe(true);
    expect(wordIdSchema.safeParse("").success).toBe(false);
  });
});
