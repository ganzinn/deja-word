import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/bookmark-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookmark-settings")>();
  return {
    ...actual,
    addBookmarksForUser: vi.fn(),
    removeBookmarksForUser: vi.fn(),
  };
});

const { getCurrentSession } = await import("@/lib/session");
const { addBookmarksForUser, removeBookmarksForUser } = await import("@/lib/bookmark-settings");
const { addBookmarks, removeBookmarksByFilter } = await import("@/app/words/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedAddBookmarks = vi.mocked(addBookmarksForUser);
const mockedRemoveBookmarks = vi.mocked(removeBookmarksForUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedAddBookmarks.mockReset();
  mockedRemoveBookmarks.mockReset();
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

describe("removeBookmarksByFilter (Server Action)", () => {
  const input = { kind: "word", q: "ap", match: "prefix" } as const;

  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await removeBookmarksByFilter(input);
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedRemoveBookmarks).not.toHaveBeenCalled();
  });

  test("invalid: schema rejects an unknown kind", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await removeBookmarksByFilter({ kind: "all" } as unknown as Parameters<
      typeof removeBookmarksByFilter
    >[0]);
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedRemoveBookmarks).not.toHaveBeenCalled();
  });

  test("invalid: occurrence kind without occurrenceId", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await removeBookmarksByFilter({
      kind: "occurrence",
      match: "prefix",
    } as unknown as Parameters<typeof removeBookmarksByFilter>[0]);
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedRemoveBookmarks).not.toHaveBeenCalled();
  });

  test("unknown: generic Error is mapped to 'unknown'", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedRemoveBookmarks.mockRejectedValue(new Error("boom"));
    const res = await removeBookmarksByFilter(input);
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: passes the parsed filter to the use case and returns removedCount", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedRemoveBookmarks.mockResolvedValue({ removedCount: 3 });
    const res = await removeBookmarksByFilter(input);
    expect(res).toEqual({ ok: true, removedCount: 3 });
    expect(mockedRemoveBookmarks).toHaveBeenCalledWith("u_1", input);
  });

  test("ok: 0 件解除も成功として返す（forbidden 変種なし）", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedRemoveBookmarks.mockResolvedValue({ removedCount: 0 });
    const res = await removeBookmarksByFilter({
      kind: "occurrence",
      occurrenceId: "occ_other",
      match: "prefix",
    });
    expect(res).toEqual({ ok: true, removedCount: 0 });
  });
});
