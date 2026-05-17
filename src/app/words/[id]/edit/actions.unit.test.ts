import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { defaultWordFormValues, type WordFormValues } from "@/lib/schema/word-form";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/words-update", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/words-update")>();
  return {
    ...actual,
    updateWordForUser: vi.fn(),
  };
});

const { getCurrentSession } = await import("@/lib/session");
const { updateWordForUser, WordNotFoundError, ForbiddenUpdateError } =
  await import("@/lib/words-update");
const { DuplicateHeadwordError, DuplicateOccurrenceNumberError } =
  await import("@/lib/words-create");
const { updateWord } = await import("@/app/words/[id]/edit/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedUpdate = vi.mocked(updateWordForUser);

function validInput(): WordFormValues {
  return {
    ...defaultWordFormValues,
    headword: "renamed",
    meanings: [
      {
        partOfSpeech: "",
        pronunciation: "",
        texts: [{ text: "新しい意味" }],
        note: "",
      },
    ],
  };
}

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedUpdate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateWord (Server Action)", () => {
  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await updateWord("w_1", validInput());
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects empty headword", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await updateWord("w_1", { ...validInput(), headword: "   " });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  test("not_found: throws WordNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new WordNotFoundError());
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
  });

  test("forbidden: throws ForbiddenUpdateError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new ForbiddenUpdateError("test reason"));
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({ ok: false, error: "forbidden", message: expect.any(String) });
  });

  test("duplicate: DuplicateHeadwordError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new DuplicateHeadwordError());
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({ ok: false, error: "duplicate", message: expect.any(String) });
  });

  test("duplicate_occurrence_number: DuplicateOccurrenceNumberError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new DuplicateOccurrenceNumberError());
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({
      ok: false,
      error: "duplicate_occurrence_number",
      message: expect.any(String),
    });
  });

  test("unknown: generic error", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedUpdate.mockRejectedValue(new Error("boom"));
    const res = await updateWord("w_x", validInput());
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: returns wordId on success", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockResolvedValue({ id: "w_1" });
    const res = await updateWord("w_1", validInput());
    expect(res).toEqual({ ok: true, wordId: "w_1" });
    expect(mockedUpdate).toHaveBeenCalledWith(
      "u_1",
      "w_1",
      expect.objectContaining({ headword: "renamed" }),
    );
  });
});
