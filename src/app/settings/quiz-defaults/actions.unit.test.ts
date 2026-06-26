import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { SaveQuizDefaultsInput } from "@/lib/schema/quiz";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/quiz-default-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz-default-settings")>();
  return {
    ...actual,
    saveQuizDefaultsForUser: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { getCurrentSession } = await import("@/lib/session");
const { saveQuizDefaultsForUser, DefaultOccurrenceNotInScopeError } =
  await import("@/lib/quiz-default-settings");
const { revalidatePath } = await import("next/cache");
const { saveQuizDefaults } = await import("@/app/settings/quiz-defaults/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedSave = vi.mocked(saveQuizDefaultsForUser);
const mockedRevalidatePath = vi.mocked(revalidatePath);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

const VALID_INPUT: SaveQuizDefaultsInput = {
  occurrenceId: "occ_1",
  rangeFrom: 1,
  rangeTo: 100,
  format: "CHOICE",
  timeoutByFormat: {
    CHOICE: 5,
    SELF_JUDGE: 20,
    MULTI_MEANING: null,
    CHOICE_JA_EN: null,
    SELF_JUDGE_JA_EN: null,
    SPELLING: null,
  },
  showCountdown: true,
  autoplayPronunciation: true,
  enableAnswerSound: true,
  autoplayAnswerAudioJaEn: true,
  choiceFirstMeaningTextOnly: null,
  drillIncludeCorrect: false,
  resetRemaining: 3,
  vagueRemaining: 2,
  initialCorrectRemaining: 1,
  saveOnStart: true,
};

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedSave.mockReset();
  mockedRevalidatePath.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveQuizDefaults (Server Action)", () => {
  test("unauthorized", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await saveQuizDefaults(VALID_INPUT);
    expect(res).toMatchObject({ ok: false, error: "unauthorized" });
    expect(mockedSave).not.toHaveBeenCalled();
  });

  test("invalid for malformed input", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await saveQuizDefaults({
      ...VALID_INPUT,
      rangeFrom: 0,
    });
    expect(res).toMatchObject({ ok: false, error: "invalid" });
    expect(mockedSave).not.toHaveBeenCalled();
  });

  test("forbidden when occurrence is outside scope", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedSave.mockRejectedValue(new DefaultOccurrenceNotInScopeError());
    const res = await saveQuizDefaults(VALID_INPUT);
    expect(res).toMatchObject({ ok: false, error: "forbidden" });
  });

  test("unknown for generic errors", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedSave.mockRejectedValue(new Error("boom"));
    const res = await saveQuizDefaults(VALID_INPUT);
    expect(res).toMatchObject({ ok: false, error: "unknown" });
  });

  test("ok: forwards to saveQuizDefaultsForUser and revalidates", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedSave.mockResolvedValue();
    const res = await saveQuizDefaults(VALID_INPUT);
    expect(res).toEqual({ ok: true });
    expect(mockedSave).toHaveBeenCalledWith("u_1", VALID_INPUT);
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/settings/quiz-defaults");
  });

  test("ok with all-null input (no defaults)", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedSave.mockResolvedValue();
    const input: SaveQuizDefaultsInput = {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: {
        CHOICE: null,
        SELF_JUDGE: null,
        MULTI_MEANING: null,
        CHOICE_JA_EN: null,
        SELF_JUDGE_JA_EN: null,
        SPELLING: null,
      },
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
    const res = await saveQuizDefaults(input);
    expect(res).toEqual({ ok: true });
    expect(mockedSave).toHaveBeenCalledWith("u_1", input);
  });
});
