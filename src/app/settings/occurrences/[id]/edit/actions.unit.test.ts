import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/occurrences-update", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/occurrences-update")>();
  return {
    ...actual,
    updateOccurrenceForUser: vi.fn(),
  };
});

const { getCurrentSession } = await import("@/lib/session");
const { updateOccurrenceForUser, OccurrenceNotFoundError } =
  await import("@/lib/occurrences-update");
const { DuplicateOccurrenceLocationError } = await import("@/lib/occurrences-create");
const { updateOccurrence } = await import("@/app/settings/occurrences/[id]/edit/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedUpdate = vi.mocked(updateOccurrenceForUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedUpdate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateOccurrence (Server Action)", () => {
  test("unauthorized", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await updateOccurrence("occ_1", {
      location: "x",
      isPreset: true,
      autoNumbering: false,
    });
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ error: "unauthorized" });
  });

  test("invalid", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await updateOccurrence("occ_1", {
      location: " ",
      isPreset: true,
      autoNumbering: false,
    });
    expect(res).toMatchObject({ ok: false, error: "invalid" });
  });

  test("not_found", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new OccurrenceNotFoundError());
    const res = await updateOccurrence("occ_1", {
      location: "x",
      isPreset: false,
      autoNumbering: false,
    });
    expect(res).toMatchObject({ ok: false, error: "not_found" });
  });

  test("duplicate", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockRejectedValue(new DuplicateOccurrenceLocationError());
    const res = await updateOccurrence("occ_1", {
      location: "dup",
      isPreset: false,
      autoNumbering: false,
    });
    expect(res).toMatchObject({ ok: false, error: "duplicate" });
  });

  test("unknown", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedUpdate.mockRejectedValue(new Error("boom"));
    const res = await updateOccurrence("occ_1", {
      location: "x",
      isPreset: false,
      autoNumbering: false,
    });
    expect(res).toMatchObject({ ok: false, error: "unknown" });
  });

  test("ok", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdate.mockResolvedValue();
    const res = await updateOccurrence("occ_1", {
      location: "x",
      isPreset: true,
      autoNumbering: true,
    });
    expect(res).toEqual({ ok: true });
    expect(mockedUpdate).toHaveBeenCalledWith("u_1", "occ_1", {
      location: "x",
      isPreset: true,
      autoNumbering: true,
    });
  });
});
