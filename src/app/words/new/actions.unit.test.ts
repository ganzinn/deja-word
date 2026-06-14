import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { defaultWordFormValues, type WordFormValues } from "@/lib/schema/word-form";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/words-create", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/words-create")>();
  return {
    ...actual,
    createWordForUser: vi.fn(),
  };
});

const { getCurrentSession } = await import("@/lib/session");
const { createWordForUser, DuplicateHeadwordError, DuplicateOccurrenceNumberError } =
  await import("@/lib/words-create");
const { createWord } = await import("@/app/words/new/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedCreate = vi.mocked(createWordForUser);

function validInput(): WordFormValues {
  return {
    ...defaultWordFormValues,
    headword: "ubiquitous",
    meanings: [
      {
        partOfSpeech: "",
        pronunciation: "",
        texts: [{ text: "あちこちにある" }],
        notes: [],
      },
    ],
  };
}

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedCreate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createWord (Server Action)", () => {
  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await createWord(validInput());
    expect(res).toEqual({
      ok: false,
      error: "unauthorized",
      message: expect.any(String),
    });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await createWord({ ...validInput(), headword: "   " });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  test("duplicate: createWordForUser throws DuplicateHeadwordError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedCreate.mockRejectedValue(new DuplicateHeadwordError());
    const res = await createWord(validInput());
    expect(res).toEqual({ ok: false, error: "duplicate", message: expect.any(String) });
  });

  test("duplicate_occurrence_number: throws DuplicateOccurrenceNumberError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedCreate.mockRejectedValue(new DuplicateOccurrenceNumberError());
    const res = await createWord(validInput());
    expect(res).toEqual({
      ok: false,
      error: "duplicate_occurrence_number",
      message: expect.any(String),
    });
  });

  test("unknown: generic Error is mapped to 'unknown'", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    // suppress console.error inside the action
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedCreate.mockRejectedValue(new Error("boom"));
    const res = await createWord(validInput());
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: returns the new wordId from createWordForUser", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedCreate.mockResolvedValue({ id: "w_new" });
    const res = await createWord(validInput());
    expect(res).toEqual({ ok: true, wordId: "w_new" });
    expect(mockedCreate).toHaveBeenCalledWith(
      "u_1",
      expect.objectContaining({ headword: "ubiquitous" }),
    );
  });
});
