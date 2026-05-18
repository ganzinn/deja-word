import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/lib/occurrence-preset-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/occurrence-preset-settings")>();
  return {
    ...actual,
    setPresetForUser: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { getCurrentSession } = await import("@/lib/session");
const { setPresetForUser, PresetOccurrenceNotInScopeError } = await import(
  "@/lib/occurrence-preset-settings"
);
const { togglePresetSetting } = await import("@/app/settings/occurrences/actions");

const mockedGetSession = vi.mocked(getCurrentSession);
const mockedSet = vi.mocked(setPresetForUser);

const SESSION = { user: { id: "u_1" } } as unknown as Awaited<
  ReturnType<typeof getCurrentSession>
>;

beforeEach(() => {
  mockedGetSession.mockReset();
  mockedSet.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("togglePresetSetting (Server Action)", () => {
  test("unauthorized", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await togglePresetSetting("occ_1", true);
    expect(res).toMatchObject({ ok: false, error: "unauthorized" });
    expect(mockedSet).not.toHaveBeenCalled();
  });

  test("forbidden when occurrence is outside scope", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedSet.mockRejectedValue(new PresetOccurrenceNotInScopeError());
    const res = await togglePresetSetting("occ_1", true);
    expect(res).toMatchObject({ ok: false, error: "forbidden" });
  });

  test("unknown for generic errors", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedSet.mockRejectedValue(new Error("boom"));
    const res = await togglePresetSetting("occ_1", true);
    expect(res).toMatchObject({ ok: false, error: "unknown" });
  });

  test("ok and forwards to setPresetForUser", async () => {
    mockedGetSession.mockResolvedValue(SESSION);
    mockedSet.mockResolvedValue();
    const res = await togglePresetSetting("occ_1", false);
    expect(res).toEqual({ ok: true });
    expect(mockedSet).toHaveBeenCalledWith("u_1", "occ_1", false);
  });
});
