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

const { getCurrentSession } = await import("@/lib/session");
const { getQuizPreviewForUser } = await import("@/lib/quiz-preview");
const { generateQuizForUser } = await import("@/lib/quiz-generate");
const { submitQuizAnswersForUser } = await import("@/lib/quiz-answers-submit");
const { getWordDetailForUser } = await import("@/lib/words-detail");
const { OccurrenceNotFoundError } = await import("@/lib/occurrences-update");
const { QuizGenerationError } = await import("@/lib/quiz/generation/dummy-pool");
const { getQuizPreview, getWordDetailForDialog, startQuiz, submitQuizAnswers } =
  await import("@/app/quiz/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedPreview = vi.mocked(getQuizPreviewForUser);
const mockedGenerate = vi.mocked(generateQuizForUser);
const mockedSubmit = vi.mocked(submitQuizAnswersForUser);
const mockedWordDetail = vi.mocked(getWordDetailForUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedPreview.mockReset();
  mockedGenerate.mockReset();
  mockedSubmit.mockReset();
  mockedWordDetail.mockReset();
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
      formats: [{ format: "CHOICE" as const, available: true, reason: null }],
    };
    mockedPreview.mockResolvedValue(preview);
    const res = await getQuizPreview(input);
    expect(res).toEqual({ ok: true, preview });
    expect(mockedPreview).toHaveBeenCalledWith("u_1", input);
  });
});

describe("startQuiz (Server Action)", () => {
  const input = { occurrenceId: "occ_1", format: "CHOICE" as const };

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
