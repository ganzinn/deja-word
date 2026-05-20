import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";

import { resolvePreset } from "./occurrence-preset";

describe("resolvePreset", () => {
  test("未選択（対応行なし）→ 未押下・ロックなし・add", () => {
    expect(resolvePreset([], "p1", false)).toEqual({
      pressed: false,
      systemLocked: false,
      action: { kind: "add" },
    });
  });

  test("自分の保存済み行 → 押下・ロックなし・remove(0)", () => {
    const rows = [{ occurrenceId: "p1", ownerId: "user_1" }];
    expect(resolvePreset(rows, "p1", false)).toEqual({
      pressed: true,
      systemLocked: false,
      action: { kind: "remove", index: 0 },
    });
  });

  test("preset トグル ON 直後（未保存・ownerId 空）→ 一般ユーザーでも remove 可", () => {
    const rows = [{ occurrenceId: "p1", ownerId: "" }];
    expect(resolvePreset(rows, "p1", false)).toEqual({
      pressed: true,
      systemLocked: false,
      action: { kind: "remove", index: 0 },
    });
  });

  test("手動追加行（occurrenceId なし）は preset を押下扱いにしない → add", () => {
    const rows = [{ ownerId: "" }];
    expect(resolvePreset(rows, "p1", false)).toEqual({
      pressed: false,
      systemLocked: false,
      action: { kind: "add" },
    });
  });

  test("保存済み system 所有行を一般ユーザーが見る → ロック・noop", () => {
    const rows = [{ occurrenceId: "p1", ownerId: SYSTEM_USER_ID }];
    expect(resolvePreset(rows, "p1", false)).toEqual({
      pressed: true,
      systemLocked: true,
      action: { kind: "noop" },
    });
  });

  test("system 所有行を system ユーザーが見る → ロックなし・remove 可", () => {
    const rows = [{ occurrenceId: "p1", ownerId: SYSTEM_USER_ID }];
    expect(resolvePreset(rows, "p1", true)).toEqual({
      pressed: true,
      systemLocked: false,
      action: { kind: "remove", index: 0 },
    });
  });

  test("複数行から正しい index を返す", () => {
    const rows = [
      { occurrenceId: "p0", ownerId: "user_1" },
      { occurrenceId: "p1", ownerId: "user_1" },
    ];
    expect(resolvePreset(rows, "p1", false).action).toEqual({ kind: "remove", index: 1 });
  });
});
