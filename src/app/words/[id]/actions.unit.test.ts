import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/words-delete", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/words-delete")>();
  return {
    ...actual,
    deleteWordForUser: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { getCurrentSession } = await import("@/lib/session");
const { deleteWordForUser, WordNotFoundError } = await import("@/lib/words-delete");
const { revalidatePath } = await import("next/cache");
const { deleteWord } = await import("@/app/words/[id]/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedDelete = vi.mocked(deleteWordForUser);
const mockedRevalidatePath = vi.mocked(revalidatePath);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedDelete.mockReset();
  mockedRevalidatePath.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteWord (Server Action)", () => {
  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await deleteWord("w_1");
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  test("not_found: deleteWordForUser throws WordNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDelete.mockRejectedValue(new WordNotFoundError());
    const res = await deleteWord("w_missing");
    expect(res).toEqual({ ok: false, error: "not_found", message: expect.any(String) });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  test("unknown: generic error is mapped to 'unknown'", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedDelete.mockRejectedValue(new Error("boom"));
    const res = await deleteWord("w_1");
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: returns { ok: true }", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDelete.mockResolvedValue();
    const res = await deleteWord("w_1");
    expect(res).toEqual({ ok: true });
    expect(mockedDelete).toHaveBeenCalledWith("u_1", "w_1");
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/words/w_1");
  });
});
