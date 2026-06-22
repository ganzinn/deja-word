import { describe, expect, test } from "vitest";

import { changeUserEmailSchema } from "@/lib/schema/change-user-email";

describe("changeUserEmailSchema", () => {
  test("accepts a valid userId and email, lowercasing the email", () => {
    const r = changeUserEmailSchema.safeParse({
      userId: "user-1",
      newEmail: "  New.User@Example.COM  ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newEmail).toBe("new.user@example.com");
  });

  test("rejects an empty userId", () => {
    const r = changeUserEmailSchema.safeParse({ userId: "", newEmail: "a@example.com" });
    expect(r.success).toBe(false);
  });

  test("rejects a malformed email", () => {
    const r = changeUserEmailSchema.safeParse({ userId: "user-1", newEmail: "not-an-email" });
    expect(r.success).toBe(false);
  });
});
