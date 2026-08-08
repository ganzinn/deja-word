import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/bookmark-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookmark-settings")>();
  return {
    ...actual,
    addBookmarksForUser: vi.fn(),
  };
});

const { getCurrentSession } = await import("@/lib/session");
const { addBookmarksForUser } = await import("@/lib/bookmark-settings");
const { addBookmarks } = await import("@/app/words/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedAddBookmarks = vi.mocked(addBookmarksForUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedAddBookmarks.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("addBookmarks (Server Action)", () => {
  const input = { wordIds: ["w_1", "w_2"] };

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await addBookmarks(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedAddBookmarks).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects empty wordIds", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await addBookmarks({ wordIds: [] });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedAddBookmarks).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects a non-string element", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await addBookmarks({ wordIds: [1] } as unknown as Parameters<
      typeof addBookmarks
    >[0]);
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedAddBookmarks).not.toHaveBeenCalled();
  });

  test("unknown: generic Error is mapped to 'unknown'", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedAddBookmarks.mockRejectedValue(new Error("boom"));
    const res = await addBookmarks(input);
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: passes through bookmarkedWordIds / skippedWordIds from the use case", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedAddBookmarks.mockResolvedValue({
      bookmarkedWordIds: ["w_1"],
      skippedWordIds: ["w_2"],
    });
    const res = await addBookmarks(input);
    expect(res).toEqual({ ok: true, bookmarkedWordIds: ["w_1"], skippedWordIds: ["w_2"] });
    expect(mockedAddBookmarks).toHaveBeenCalledWith("u_1", input.wordIds);
  });

  test("ok: all wordIds skipped is a success (no forbidden variant)", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedAddBookmarks.mockResolvedValue({
      bookmarkedWordIds: [],
      skippedWordIds: ["w_1", "w_2"],
    });
    const res = await addBookmarks(input);
    expect(res).toEqual({ ok: true, bookmarkedWordIds: [], skippedWordIds: ["w_1", "w_2"] });
  });
});
