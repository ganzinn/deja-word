import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AccountProfileValues } from "@/lib/schema/account-profile";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      updateUser: vi.fn(),
    },
  },
}));

const { getCurrentSession } = await import("@/lib/session");
const { auth } = await import("@/lib/auth");
const { updateProfile } = await import("@/app/account/edit/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedUpdateUser = vi.mocked(auth.api.updateUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<ReturnType<typeof getCurrentSession>>;

function validInput(): AccountProfileValues {
  return { name: "山田 太郎" };
}

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedUpdateUser.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateProfile (Server Action)", () => {
  test("unauthorized: no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await updateProfile(validInput());
    expect(res).toEqual({ ok: false, error: "unauthorized", message: expect.any(String) });
    expect(mockedUpdateUser).not.toHaveBeenCalled();
  });

  test("invalid: empty name is rejected", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    const res = await updateProfile({ name: "   " });
    expect(res).toEqual({ ok: false, error: "invalid", message: expect.any(String) });
    expect(mockedUpdateUser).not.toHaveBeenCalled();
  });

  test("unknown: updateUser throws", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedUpdateUser.mockRejectedValue(new Error("boom"));
    const res = await updateProfile(validInput());
    expect(res).toEqual({ ok: false, error: "unknown", message: expect.any(String) });
  });

  test("ok: trims and forwards name to updateUser", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedUpdateUser.mockResolvedValue({ status: true } as never);
    const res = await updateProfile({ name: "  新しい名前  " });
    expect(res).toEqual({ ok: true });
    expect(mockedUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: "新しい名前" } }),
    );
  });
});
