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

const { getCurrentSession } = await import("@/lib/session");
const { getQuizPreviewForUser } = await import("@/lib/quiz-preview");
const { generateQuizForUser } = await import("@/lib/quiz-generate");
const { submitQuizAnswersForUser } = await import("@/lib/quiz-answers-submit");
const { getWordDetailForUser } = await import("@/lib/words-detail");
const { createDrillForUser, EmptyDrillResultsError } = await import("@/lib/drill-create");
const { generateDrillRoundForUser } = await import("@/lib/drill-round-generate");
const { submitDrillRoundForUser } = await import("@/lib/drill-round-submit");
const { deleteDrillForUser } = await import("@/lib/drill-delete");
const { OccurrenceNotFoundError } = await import("@/lib/occurrences-update");
const { QuizGenerationError } = await import("@/lib/quiz/generation/dummy-pool");
const { DrillNotFoundError, DrillRoundConflictError } =
  await import("@/lib/quiz/handlers/drill-round-handler");
const {
  deleteDrill,
  getQuizPreview,
  getWordDetailForDialog,
  startDrill,
  startDrillRound,
  startQuiz,
  submitDrillRound,
  submitQuizAnswers,
} = await import("@/app/quiz/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedPreview = vi.mocked(getQuizPreviewForUser);
const mockedGenerate = vi.mocked(generateQuizForUser);
const mockedSubmit = vi.mocked(submitQuizAnswersForUser);
const mockedWordDetail = vi.mocked(getWordDetailForUser);
const mockedDrillCreate = vi.mocked(createDrillForUser);
const mockedDrillRoundGenerate = vi.mocked(generateDrillRoundForUser);
const mockedDrillRoundSubmit = vi.mocked(submitDrillRoundForUser);
const mockedDrillDelete = vi.mocked(deleteDrillForUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedPreview.mockReset();
  mockedGenerate.mockReset();
  mockedSubmit.mockReset();
  mockedWordDetail.mockReset();
  mockedDrillCreate.mockReset();
  mockedDrillRoundGenerate.mockReset();
  mockedDrillRoundSubmit.mockReset();
  mockedDrillDelete.mockReset();
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
      excluded: { noNumber: 2, noMeaning: 1 },
    };
    mockedPreview.mockResolvedValue(preview);
    const res = await getQuizPreview(input);
    expect(res).toEqual({ ok: true, preview });
    expect(mockedPreview).toHaveBeenCalledWith("u_1", input);
  });
});

describe("startQuiz (Server Action)", () => {
  const input = {
    occurrenceId: "occ_1",
    format: "CHOICE" as const,
    timeoutSeconds: null,
    choiceFirstMeaningTextOnly: false,
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
          choices: [{ text: "a" }, { text: "b" }],
          correctIndex: 0,
        },
      ],
    };
    mockedGenerate.mockResolvedValue(quiz);
    const res = await startQuiz(input);
    expect(res).toEqual({ ok: true, quiz });
    expect(mockedGenerate).toHaveBeenCalledWith("u_1", input);
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

  test("ok: returns the word detail as-is", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const word = { id: "w_1", headword: "ubiquitous" } as unknown as NonNullable<
      Awaited<ReturnType<typeof getWordDetailForUser>>
    >;
    mockedWordDetail.mockResolvedValue(word);
    const res = await getWordDetailForDialog("w_1");
    expect(res).toEqual({ ok: true, word });
    expect(mockedWordDetail).toHaveBeenCalledWith("u_1", "w_1");
  });
});

describe("startDrill (Server Action)", () => {
  const input = {
    occurrenceId: "occ_1",
    format: "CHOICE" as const,
    timeoutSeconds: null,
    choiceFirstMeaningTextOnly: false,
    drillIncludeCorrect: false,
    results: [
      { wordId: "w_1", correct: true },
      { wordId: "w_2", correct: false },
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
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
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
    expect(mockedDrillCreate).toHaveBeenCalledWith("u_1", input);
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

  test("ok: returns the round quiz payload and roundCount", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const quiz = {
      format: "CHOICE" as const,
      timeoutSeconds: null,
      questions: [
        {
          wordId: "w_1",
          headword: "ubiquitous",
          pronunciationAudioUrl: null,
          choices: [{ text: "a" }, { text: "b" }],
          correctIndex: 0,
        },
      ],
    };
    mockedDrillRoundGenerate.mockResolvedValue({ quiz, roundCount: 2 });
    const res = await startDrillRound(input);
    expect(res).toEqual({ ok: true, quiz, roundCount: 2 });
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
