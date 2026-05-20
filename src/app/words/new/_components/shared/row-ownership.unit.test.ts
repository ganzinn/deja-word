import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";

import { isSystemOwned } from "./row-ownership";

describe("isSystemOwned", () => {
  test("system 所有行を一般ユーザーが見ると true", () => {
    expect(isSystemOwned(SYSTEM_USER_ID, false)).toBe(true);
  });

  test("system 所有行を system ユーザーが見ると false（編集可）", () => {
    expect(isSystemOwned(SYSTEM_USER_ID, true)).toBe(false);
  });

  test("自分所有行は false", () => {
    expect(isSystemOwned("user_123", false)).toBe(false);
  });

  test("ownerId 未設定（新規行）は false", () => {
    expect(isSystemOwned(undefined, false)).toBe(false);
  });

  test("ownerId 空文字は false", () => {
    expect(isSystemOwned("", false)).toBe(false);
  });
});
