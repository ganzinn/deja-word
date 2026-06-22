import { describe, expect, test } from "vitest";

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  setPasswordSchema,
} from "@/lib/schema/set-password";

describe("setPasswordSchema", () => {
  test("accepts matching passwords of valid length", () => {
    const r = setPasswordSchema.safeParse({
      newPassword: "password123",
      confirmPassword: "password123",
    });
    expect(r.success).toBe(true);
  });

  test("rejects too-short password", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const r = setPasswordSchema.safeParse({ newPassword: short, confirmPassword: short });
    expect(r.success).toBe(false);
  });

  test("rejects too-long password", () => {
    const long = "a".repeat(MAX_PASSWORD_LENGTH + 1);
    const r = setPasswordSchema.safeParse({ newPassword: long, confirmPassword: long });
    expect(r.success).toBe(false);
  });

  test("rejects mismatched confirmation", () => {
    const r = setPasswordSchema.safeParse({
      newPassword: "password123",
      confirmPassword: "password124",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toContain("confirmPassword");
    }
  });
});
