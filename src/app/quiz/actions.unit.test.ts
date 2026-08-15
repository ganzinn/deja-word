import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/quiz-preview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz-preview")>();
  return {
    ...actual,
    getQuizPreviewForUser: vi.fn(),
  };
});

vi.mock("@/lib/quiz-generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz-generate")>();
  return {
    ...actual,
    generateQuizForUser: vi.fn(),
  };
});

vi.mock("@/lib/quiz-answers-submit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz-answers-submit")>();
  return {
    ...actual,
    submitQuizAnswersForUser: vi.fn(),
  };
});

vi.mock("@/lib/words-detail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/words-detail")>();
  return {
    ...actual,
    getWordDetailForUser: vi.fn(),
  };
});

vi.mock("@/lib/bookmark-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookmark-settings")>();
  return {
    ...actual,
    getBookmarkedWordIdsForUser: vi.fn(),
  };
});

vi.mock("@/lib/drill-create", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drill-create")>();
  return {
    ...actual,
    createDrillForUser: vi.fn(),
  };
});

vi.mock("@/lib/drill-round-generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drill-round-generate")>();
  return {
    ...actual,
    generateDrillRoundForUser: vi.fn(),
  };
});

vi.mock("@/lib/drill-round-submit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drill-round-submit")>();
  return {
    ...actual,
    submitDrillRoundForUser: vi.fn(),
  };
});

vi.mock("@/lib/drill-delete", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drill-delete")>();
  return {
    ...actual,
    deleteDrillForUser: vi.fn(),
  };
});

vi.mock("@/lib/drill-retry-generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drill-retry-generate")>();
  return {
    ...actual,
    generateDrillRetryForUser: vi.fn(),
  };
});

vi.mock("@/lib/drill-retry-submit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drill-retry-submit")>();
  return {
    ...actual,
    submitDrillRetryForUser: vi.fn(),
  };
});

const { getCurrentSession } = await import("@/lib/session");
const { getQuizPreviewForUser } = await import("@/lib/quiz-preview");
const { generateQuizForUser } = await import("@/lib/quiz-generate");
const { submitQuizAnswersForUser } = await import("@/lib/quiz-answers-submit");
const { getWordDetailForUser } = await import("@/lib/words-detail");
const { getBookmarkedWordIdsForUser } = await import("@/lib/bookmark-settings");
const { createDrillForUser, EmptyDrillResultsError } = await import("@/lib/drill-create");
const { generateDrillRoundForUser, DrillNoAskableWordsError } =
  await import("@/lib/drill-round-generate");
const { submitDrillRoundForUser } = await import("@/lib/drill-round-submit");
const { deleteDrillForUser } = await import("@/lib/drill-delete");
const { generateDrillRetryForUser, EmptyDrillRetryError } =
  await import("@/lib/drill-retry-generate");
const { submitDrillRetryForUser } = await import("@/lib/drill-retry-submit");
const { OccurrenceNotFoundError } = await import("@/lib/occurrences-update");
const { QuizGenerationError } = await import("@/lib/quiz/generation/dummy-pool");
const { DrillNotFoundError, DrillRoundConflictError } =
  await import("@/lib/quiz/handlers/drill-round-handler");
const {
  deleteDrill,
  getQuizPreview,
  getWordDetailForDialog,
  startDrill,
  startDrillRetry,
  startDrillRound,
  startQuiz,
  submitDrillRetry,
  submitDrillRound,
  submitQuizAnswers,
} = await import("@/app/quiz/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedPreview = vi.mocked(getQuizPreviewForUser);
const mockedGenerate = vi.mocked(generateQuizForUser);
const mockedSubmit = vi.mocked(submitQuizAnswersForUser);
const mockedWordDetail = vi.mocked(getWordDetailForUser);
const mockedBookmarkedWordIds = vi.mocked(getBookmarkedWordIdsForUser);
const mockedDrillCreate = vi.mocked(createDrillForUser);
const mockedDrillRoundGenerate = vi.mocked(generateDrillRoundForUser);
const mockedDrillRoundSubmit = vi.mocked(submitDrillRoundForUser);
const mockedDrillDelete = vi.mocked(deleteDrillForUser);
const mockedDrillRetryGenerate = vi.mocked(generateDrillRetryForUser);
const mockedDrillRetrySubmit = vi.mocked(submitDrillRetryForUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedPreview.mockReset();
  mockedGenerate.mockReset();
  mockedSubmit.mockReset();
  mockedWordDetail.mockReset();
  mockedBookmarkedWordIds.mockReset();
  mockedDrillCreate.mockReset();
  mockedDrillRoundGenerate.mockReset();
  mockedDrillRoundSubmit.mockReset();
  mockedDrillDelete.mockReset();
  mockedDrillRetryGenerate.mockReset();
  mockedDrillRetrySubmit.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getQuizPreview (Server Action)", () => {
  const input = { occurrenceId: "occ_1", rangeFrom: 1, rangeTo: 100 };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await getQuizPreview(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects a non-integer range", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await getQuizPreview({ occurrenceId: "occ_1", rangeFrom: 1.5 });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  test("not_found: maps OccurrenceNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedPreview.mockRejectedValue(new OccurrenceNotFoundError());
    const res = await getQuizPreview(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("unknown: generic Error is mapped to 'unknown'", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedPreview.mockRejectedValue(new Error("boom"));
    const res = await getQuizPreview(input);
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: returns the preview from the use case", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const preview = {
      targetCount: 10,
      excluded: { noNumber: 2, noMeaning: 1, noTgExample: null },
    };
    mockedPreview.mockResolvedValue(preview);
    const res = await getQuizPreview(input);
    expect(res).toEqual({ ok: true, preview });
    // スキーマの bookmarkedOnly `.default(false)` がパース後に補われる。
    expect(mockedPreview).toHaveBeenCalledWith("u_1", { ...input, bookmarkedOnly: false });
  });
});

describe("startQuiz (Server Action)", () => {
  const input = {
    occurrenceId: "occ_1",
    format: "CHOICE" as const,
    timeoutSeconds: null,
    firstMeaningTextOnly: false,
  };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await startQuiz(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects an unknown format", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await startQuiz({
      occurrenceId: "occ_1",
      format: "BOGUS",
      timeoutSeconds: null,
    } as unknown as Parameters<typeof startQuiz>[0]);
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  test("generation_failed: maps QuizGenerationError with its message", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedGenerate.mockRejectedValue(new QuizGenerationError("出題対象の単語がありません"));
    const res = await startQuiz(input);
    expect(res).toEqual({
      ok: false,
      error: "generation_failed",
      message: "出題対象の単語がありません",
    });
  });

  test("not_found: maps OccurrenceNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedGenerate.mockRejectedValue(new OccurrenceNotFoundError());
    const res = await startQuiz(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("ok: returns the generated quiz payload", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const quiz = {
      format: "CHOICE" as const,
      timeoutSeconds: null,
      questions: [
        {
          wordId: "w_1",
          headword: "ubiquitous",
          pronunciationAudioUrl: null,
          ttsText: "ubiquitous",
          choices: [{ text: "a" }, { text: "b" }],
          correctIndex: 0,
          correctMeaningTexts: ["a"],
        },
      ],
    };
    mockedGenerate.mockResolvedValue(quiz);
    const res = await startQuiz(input);
    expect(res).toEqual({ ok: true, quiz });
    // スキーマの bookmarkedOnly / orderByOccurrenceNumber `.default(false)` がパース後に補われる。
    expect(mockedGenerate).toHaveBeenCalledWith("u_1", {
      ...input,
      bookmarkedOnly: false,
      orderByOccurrenceNumber: false,
    });
  });
});

describe("submitQuizAnswers (Server Action)", () => {
  const input = {
    format: "CHOICE" as const,
    answers: [{ wordId: "w_1", result: "CORRECT" as const }],
  };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await submitQuizAnswers(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects an invalid result inside answers", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await submitQuizAnswers({
      format: "CHOICE",
      answers: [
        { wordId: "w_1", result: "CORRECT" },
        { wordId: "w_2", result: "WRONG_VALUE" },
      ],
    } as unknown as Parameters<typeof submitQuizAnswers>[0]);
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects an unknown top-level format", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await submitQuizAnswers({
      format: "BOGUS",
      answers: [{ wordId: "w_1", result: "CORRECT" }],
    } as unknown as Parameters<typeof submitQuizAnswers>[0]);
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  test("unknown: generic Error is mapped to 'unknown'", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedSubmit.mockRejectedValue(new Error("boom"));
    const res = await submitQuizAnswers(input);
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: returns savedCount and skippedWordIds", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedSubmit.mockResolvedValue({ savedCount: 1, skippedWordIds: ["w_gone"] });
    const res = await submitQuizAnswers(input);
    expect(res).toEqual({ ok: true, savedCount: 1, skippedWordIds: ["w_gone"] });
    expect(mockedSubmit).toHaveBeenCalledWith("u_1", input);
  });
});

describe("getWordDetailForDialog (Server Action)", () => {
  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await getWordDetailForDialog("w_1");
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedWordDetail).not.toHaveBeenCalled();
  });

  test("invalid: empty wordId", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await getWordDetailForDialog("");
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedWordDetail).not.toHaveBeenCalled();
  });

  test("not_found: use case returns null", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedWordDetail.mockResolvedValue(null);
    const res = await getWordDetailForDialog("w_missing");
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("ok: returns the word detail with the bookmark state alongside", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const word = { id: "w_1", headword: "ubiquitous" } as unknown as NonNullable<
      Awaited<ReturnType<typeof getWordDetailForUser>>
    >;
    mockedWordDetail.mockResolvedValue(word);
    mockedBookmarkedWordIds.mockResolvedValue(["w_1"]);
    const res = await getWordDetailForDialog("w_1");
    expect(res).toEqual({ ok: true, word, bookmarked: true });
    expect(mockedWordDetail).toHaveBeenCalledWith("u_1", "w_1");
    // ブックマーク状態は 1 件配列で本人分を引く
    expect(mockedBookmarkedWordIds).toHaveBeenCalledWith("u_1", ["w_1"]);
  });

  test("ok: bookmarked=false when the word is not bookmarked", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const word = { id: "w_1", headword: "ubiquitous" } as unknown as NonNullable<
      Awaited<ReturnType<typeof getWordDetailForUser>>
    >;
    mockedWordDetail.mockResolvedValue(word);
    mockedBookmarkedWordIds.mockResolvedValue([]);
    const res = await getWordDetailForDialog("w_1");
    expect(res).toEqual({ ok: true, word, bookmarked: false });
  });
});

describe("startDrill (Server Action)", () => {
  const input = {
    occurrenceId: "occ_1",
    format: "CHOICE" as const,
    timeoutSeconds: null,
    firstMeaningTextOnly: false,
    drillIncludeCorrect: false,
    resetRemaining: 3,
    vagueRemaining: 2,
    initialCorrectRemaining: 1,
    results: [
      { wordId: "w_1", result: "CORRECT" as const },
      { wordId: "w_2", result: "INCORRECT" as const },
    ],
  };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await startDrill(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedDrillCreate).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects empty results", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await startDrill({
      occurrenceId: "occ_1",
      format: "CHOICE",
      timeoutSeconds: null,
      firstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [],
    });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillCreate).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects an unknown format", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await startDrill({
      ...input,
      format: "BOGUS",
    } as unknown as Parameters<typeof startDrill>[0]);
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillCreate).not.toHaveBeenCalled();
  });

  test("not_found: maps OccurrenceNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillCreate.mockRejectedValue(new OccurrenceNotFoundError());
    const res = await startDrill(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("not_found: maps EmptyDrillResultsError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillCreate.mockRejectedValue(new EmptyDrillResultsError());
    const res = await startDrill(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("ok: returns the created drillId", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillCreate.mockResolvedValue({ drillId: "d_1" });
    const res = await startDrill(input);
    expect(res).toEqual({ ok: true, drillId: "d_1" });
    // スキーマの sourceBookmarkedOnly / orderByOccurrenceNumber `.default(false)` がパース後に補われる。
    expect(mockedDrillCreate).toHaveBeenCalledWith("u_1", {
      ...input,
      sourceBookmarkedOnly: false,
      orderByOccurrenceNumber: false,
    });
  });
});

describe("startDrillRound (Server Action)", () => {
  const input = { drillId: "d_1" };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await startDrillRound(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedDrillRoundGenerate).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects an empty drillId", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await startDrillRound({ drillId: "" });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillRoundGenerate).not.toHaveBeenCalled();
  });

  test("not_found: maps DrillNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRoundGenerate.mockRejectedValue(new DrillNotFoundError());
    const res = await startDrillRound(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("generation_failed: maps QuizGenerationError with its message", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRoundGenerate.mockRejectedValue(
      new QuizGenerationError("出題できる単語がありません"),
    );
    const res = await startDrillRound(input);
    expect(res).toEqual({
      ok: false,
      error: "generation_failed",
      message: "出題できる単語がありません",
    });
  });

  test("generation_failed: maps DrillNoAskableWordsError (self-healing completed the drill, ADR-0067)", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRoundGenerate.mockRejectedValue(new DrillNoAskableWordsError());
    const res = await startDrillRound(input);
    expect(res).toEqual({
      ok: false,
      error: "generation_failed",
      message: "出題できない単語を対象から外したため、この定着モードは完了になりました。",
    });
  });

  test("ok: returns the round quiz payload, roundCount and sourceTest", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const quiz = {
      format: "CHOICE" as const,
      timeoutSeconds: null,
      questions: [
        {
          wordId: "w_1",
          headword: "ubiquitous",
          pronunciationAudioUrl: null,
          ttsText: "ubiquitous",
          choices: [{ text: "a" }, { text: "b" }],
          correctIndex: 0,
          correctMeaningTexts: ["a"],
        },
      ],
    };
    // 完了画面の「同じ範囲でもう一度テストする」用の元テスト開始入力（docs/adr/0042-retest-same-range.md）
    const sourceTest = {
      occurrenceId: "o_1",
      rangeFrom: 1,
      rangeTo: 20,
      format: "CHOICE" as const,
      timeoutSeconds: null,
      firstMeaningTextOnly: false,
    };
    mockedDrillRoundGenerate.mockResolvedValue({
      quiz,
      roundCount: 2,
      sourceTest,
      occurrenceName: "本A",
    });
    const res = await startDrillRound(input);
    expect(res).toEqual({ ok: true, quiz, roundCount: 2, sourceTest, occurrenceName: "本A" });
    expect(mockedDrillRoundGenerate).toHaveBeenCalledWith("u_1", input);
  });
});

describe("submitDrillRound (Server Action)", () => {
  const input = {
    drillId: "d_1",
    expectedRoundCount: 1,
    answers: [{ wordId: "w_1", result: "CORRECT" as const }],
  };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await submitDrillRound(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedDrillRoundSubmit).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects a negative expectedRoundCount", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await submitDrillRound({ ...input, expectedRoundCount: -1 });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillRoundSubmit).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects empty answers", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await submitDrillRound({ ...input, answers: [] });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillRoundSubmit).not.toHaveBeenCalled();
  });

  test("not_found: maps DrillNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRoundSubmit.mockRejectedValue(new DrillNotFoundError());
    const res = await submitDrillRound(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("conflict: maps DrillRoundConflictError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRoundSubmit.mockRejectedValue(new DrillRoundConflictError());
    const res = await submitDrillRound(input);
    expect(res).toEqual({ ok: false, error: "conflict", message: expect.any(String) });
  });

  test("ok: returns remaining / completed / alreadyApplied", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRoundSubmit.mockResolvedValue({
      remaining: [{ wordId: "w_1", remaining: 0 }],
      completed: true,
      alreadyApplied: false,
    });
    const res = await submitDrillRound(input);
    expect(res).toEqual({
      ok: true,
      remaining: [{ wordId: "w_1", remaining: 0 }],
      completed: true,
      alreadyApplied: false,
    });
    expect(mockedDrillRoundSubmit).toHaveBeenCalledWith("u_1", input);
  });
});

describe("startDrillRetry (Server Action)", () => {
  const input = { drillId: "d_1", wordIds: ["w_1", "w_2"] };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await startDrillRetry(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedDrillRetryGenerate).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects an empty drillId", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await startDrillRetry({ ...input, drillId: "" });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillRetryGenerate).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects empty wordIds", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await startDrillRetry({ ...input, wordIds: [] });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillRetryGenerate).not.toHaveBeenCalled();
  });

  test("not_found: maps DrillNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRetryGenerate.mockRejectedValue(new DrillNotFoundError());
    const res = await startDrillRetry(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("not_found: maps EmptyDrillRetryError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRetryGenerate.mockRejectedValue(new EmptyDrillRetryError());
    const res = await startDrillRetry(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("ok: returns the retry quiz payload (no roundCount)", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const quiz = {
      format: "CHOICE" as const,
      timeoutSeconds: null,
      questions: [
        {
          wordId: "w_1",
          headword: "ubiquitous",
          pronunciationAudioUrl: null,
          ttsText: "ubiquitous",
          choices: [{ text: "a" }, { text: "b" }],
          correctIndex: 0,
          correctMeaningTexts: ["a"],
        },
      ],
    };
    mockedDrillRetryGenerate.mockResolvedValue({ quiz });
    const res = await startDrillRetry(input);
    expect(res).toEqual({ ok: true, quiz });
    expect(mockedDrillRetryGenerate).toHaveBeenCalledWith("u_1", input);
  });
});

describe("submitDrillRetry (Server Action)", () => {
  const input = {
    drillId: "d_1",
    answers: [{ wordId: "w_1", result: "CORRECT" as const }],
  };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await submitDrillRetry(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedDrillRetrySubmit).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects an empty drillId", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await submitDrillRetry({ ...input, drillId: "" });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillRetrySubmit).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects empty answers", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await submitDrillRetry({ ...input, answers: [] });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillRetrySubmit).not.toHaveBeenCalled();
  });

  test("not_found: maps DrillNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRetrySubmit.mockRejectedValue(new DrillNotFoundError());
    const res = await submitDrillRetry(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("ok: returns savedCount / skippedWordIds", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillRetrySubmit.mockResolvedValue({ savedCount: 1, skippedWordIds: ["w_2"] });
    const res = await submitDrillRetry(input);
    expect(res).toEqual({ ok: true, savedCount: 1, skippedWordIds: ["w_2"] });
    expect(mockedDrillRetrySubmit).toHaveBeenCalledWith("u_1", input);
  });
});

describe("deleteDrill (Server Action)", () => {
  const input = { drillId: "d_1" };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await deleteDrill(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedDrillDelete).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects an empty drillId", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await deleteDrill({ drillId: "" });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDrillDelete).not.toHaveBeenCalled();
  });

  test("not_found: maps DrillNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillDelete.mockRejectedValue(new DrillNotFoundError());
    const res = await deleteDrill(input);
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("unknown: generic Error is mapped to 'unknown'", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedDrillDelete.mockRejectedValue(new Error("boom"));
    const res = await deleteDrill(input);
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: returns success without extra payload", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDrillDelete.mockResolvedValue(undefined);
    const res = await deleteDrill(input);
    expect(res).toEqual({ ok: true });
    expect(mockedDrillDelete).toHaveBeenCalledWith("u_1", "d_1");
  });
});
