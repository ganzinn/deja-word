import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: {}, $context: Promise.resolve({ secret: "test-secret" }) },
}));

vi.mock("@/lib/admin-user-delete", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-user-delete")>();
  return {
    ...actual,
    deleteUserForAdmin: vi.fn(),
  };
});

const { getCurrentSession } = await import("@/lib/session");
const { deleteUserForAdmin, UserNotFoundError } = await import("@/lib/admin-user-delete");
const { deleteUser } = await import("@/app/admin/users/actions");
const { SYSTEM_USER_ID } = await import("@/lib/system-user");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedDelete = vi.mocked(deleteUserForAdmin);

const adminSession = {
  user: { id: SYSTEM_USER_ID },
} as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedDelete.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteUser (Server Action)", () => {
  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await deleteUser({ userId: "u_1" });
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  test("unauthorized: non-system user", async () => {
    mockedGetSession.mockResolvedValue({
      user: { id: "u_1" },
    } as unknown as Awaited<ReturnType<typeof getCurrentSession>>);
    const res = await deleteUser({ userId: "u_2" });
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  test("invalid: deleting the system user is rejected before calling the service", async () => {
    mockedGetSession.mockResolvedValue(adminSession);
    const res = await deleteUser({ userId: SYSTEM_USER_ID });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  test("invalid: service throws UserNotFoundError", async () => {
    mockedGetSession.mockResolvedValue(adminSession);
    mockedDelete.mockRejectedValue(new UserNotFoundError());
    const res = await deleteUser({ userId: "u_missing" });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
  });

  test("unknown: generic error is mapped to 'unknown'", async () => {
    mockedGetSession.mockResolvedValue(adminSession);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedDelete.mockRejectedValue(new Error("boom"));
    const res = await deleteUser({ userId: "u_1" });
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: returns { ok: true } and delegates to the service", async () => {
    mockedGetSession.mockResolvedValue(adminSession);
    mockedDelete.mockResolvedValue();
    const res = await deleteUser({ userId: "u_1" });
    expect(res).toEqual({ ok: true });
    expect(mockedDelete).toHaveBeenCalledWith("u_1");
  });
});
