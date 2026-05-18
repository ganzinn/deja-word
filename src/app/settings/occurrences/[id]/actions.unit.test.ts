import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/occurrences-delete", () => ({
  deleteOccurrenceForUser: vi.fn(),
}));

const { getCurrentSession } = await import("@/lib/session");
const { deleteOccurrenceForUser } = await import("@/lib/occurrences-delete");
const { OccurrenceNotFoundError } = await import("@/lib/occurrences-update");
const { deleteOccurrence } = await import("@/app/settings/occurrences/[id]/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedDelete = vi.mocked(deleteOccurrenceForUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<
  ReturnType<typeof getCurrentSession>
>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedDelete.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteOccurrence (Server Action)", () => {
  test("unauthorized", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await deleteOccurrence("occ_1");
    expect(res).toMatchObject({ ok: false, error: "unauthorized" });
  });

  test("not_found", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDelete.mockRejectedValue(new OccurrenceNotFoundError());
    const res = await deleteOccurrence("occ_1");
    expect(res).toMatchObject({ ok: false, error: "not_found" });
  });

  test("unknown", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedDelete.mockRejectedValue(new Error("boom"));
    const res = await deleteOccurrence("occ_1");
    expect(res).toMatchObject({ ok: false, error: "unknown" });
  });

  test("ok", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedDelete.mockResolvedValue();
    const res = await deleteOccurrence("occ_1");
    expect(res).toEqual({ ok: true });
    expect(mockedDelete).toHaveBeenCalledWith("u_1", "occ_1");
  });
});
