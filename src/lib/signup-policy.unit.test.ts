import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("signup-policy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("signUpDisabled is true when DISABLE_SIGNUP='true'", async () => {
    vi.stubEnv("DISABLE_SIGNUP", "true");
    const { signUpDisabled } = await import("@/lib/signup-policy");
    expect(signUpDisabled).toBe(true);
  });

  test.each([
    ["unset", undefined],
    ["false string", "false"],
    ["truthy non-'true' string", "1"],
    ["empty string", ""],
    ["TRUE (case-sensitive)", "TRUE"],
  ])("signUpDisabled is false when DISABLE_SIGNUP is %s", async (_label, value) => {
    if (value === undefined) {
      vi.stubEnv("DISABLE_SIGNUP", "");
    } else {
      vi.stubEnv("DISABLE_SIGNUP", value);
    }
    const { signUpDisabled } = await import("@/lib/signup-policy");
    expect(signUpDisabled).toBe(false);
  });
});
