import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID, scopedOwnerIds } from "@/lib/system-user";

describe("system-user", () => {
  test("SYSTEM_USER_ID is the literal 'system'", () => {
    expect(SYSTEM_USER_ID).toBe("system");
  });

  test("scopedOwnerIds returns [system, user] in that order", () => {
    expect(scopedOwnerIds("u_123")).toEqual(["system", "u_123"]);
  });

  test("when called with SYSTEM_USER_ID itself, returns duplicates (caller responsibility)", () => {
    expect(scopedOwnerIds(SYSTEM_USER_ID)).toEqual(["system", "system"]);
  });
});
