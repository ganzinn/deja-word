import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/occurrences-create", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/occurrences-create")>();
  return {
    ...actual,
    createOccurrenceForUser: vi.fn(),
  };
});

const { getCurrentSession } = await import("@/lib/session");
const { createOccurrenceForUser, DuplicateOccurrenceLocationError } =
  await import("@/lib/occurrences-create");
const { createOccurrence } = await import("@/app/settings/occurrences/new/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedCreate = vi.mocked(createOccurrenceForUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedCreate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createOccurrence (Server Action)", () => {
  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await createOccurrence({ location: "TOEIC", isPreset: true });
    expect(res).toEqual({
      ok: false,
      error: "unauthorized",
      message: expect.any(String),
    });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  test("invalid: empty location", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await createOccurrence({ location: "   ", isPreset: true });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  test("duplicate: throws DuplicateOccurrenceLocationError", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedCreate.mockRejectedValue(new DuplicateOccurrenceLocationError());
    const res = await createOccurrence({ location: "TOEIC", isPreset: true });
    expect(res).toEqual({ ok: false, error: "duplicate", message: expect.any(String) });
  });

  test("unknown: generic error", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedCreate.mockRejectedValue(new Error("boom"));
    const res = await createOccurrence({ location: "TOEIC", isPreset: true });
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: returns new occurrenceId", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedCreate.mockResolvedValue({ id: "occ_new" });
    const res = await createOccurrence({ location: "TOEIC", isPreset: false });
    expect(res).toEqual({ ok: true, occurrenceId: "occ_new" });
    expect(mockedCreate).toHaveBeenCalledWith("u_1", { location: "TOEIC", isPreset: false });
  });
});
