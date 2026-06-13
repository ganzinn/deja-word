import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  DefaultOccurrenceNotInScopeError,
  clearQuizDefaultsForUser,
  getQuizDefaultsForUser,
  saveQuizDefaultsForUser,
} from "@/lib/quiz-default-settings";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import type { QuizFormat } from "@/generated/prisma/enums";

import { createOccurrenceRow, createTestUser } from "../../tests/setup/fixtures";

/** 指定形式だけ秒数を入れ、残りは null（制限なし）にした全形式キーの map。 */
function timeoutMap(
  partial: Partial<Record<QuizFormat, number>>,
): Record<QuizFormat, number | null> {
  return {
    CHOICE: partial.CHOICE ?? null,
    SELF_JUDGE: partial.SELF_JUDGE ?? null,
    MULTI_MEANING: partial.MULTI_MEANING ?? null,
  };
}

describe("saveQuizDefaultsForUser", () => {
  test("creates one row and re-save updates it in place", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "自前 location", 0);

    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: 1,
      rangeTo: 100,
      format: "CHOICE",
      timeoutByFormat: timeoutMap({ CHOICE: 5, SELF_JUDGE: 20 }),
      showCountdown: true,
      enableSound: true,
    });
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: null,
      rangeTo: 50,
      format: "SELF_JUDGE",
      timeoutByFormat: timeoutMap({ SELF_JUDGE: 30 }),
      showCountdown: false,
      enableSound: false,
    });

    const rows = await prisma.quizDefaultSetting.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      occurrenceId: occ.id,
      rangeFrom: null,
      rangeTo: 50,
      format: "SELF_JUDGE",
      showCountdown: false,
      enableSound: false,
    });
  });

  test("syncs per-format timeout rows: upsert for values, delete for null on re-save", async () => {
    const user = await createTestUser();

    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: timeoutMap({ CHOICE: 5, SELF_JUDGE: 20, MULTI_MEANING: 30 }),
      showCountdown: null,
      enableSound: null,
    });
    expect(await prisma.quizDefaultTimeout.count({ where: { userId: user.id } })).toBe(3);

    // CHOICE は値変更、SELF_JUDGE は据え置き、MULTI_MEANING は null 化（行削除）
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: timeoutMap({ CHOICE: 10, SELF_JUDGE: 20 }),
      showCountdown: null,
      enableSound: null,
    });

    const defaults = await getQuizDefaultsForUser(user.id);
    expect(defaults?.timeoutByFormat).toEqual(timeoutMap({ CHOICE: 10, SELF_JUDGE: 20 }));
    expect(
      await prisma.quizDefaultTimeout.findUnique({
        where: { userId_format: { userId: user.id, format: "MULTI_MEANING" } },
      }),
    ).toBeNull();
  });

  test("accepts all-null defaults", async () => {
    const user = await createTestUser();
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: timeoutMap({}),
      showCountdown: null,
      enableSound: null,
    });
    const defaults = await getQuizDefaultsForUser(user.id);
    expect(defaults).toEqual({
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: timeoutMap({}),
      showCountdown: null,
      enableSound: null,
    });
    // QuizDefaultSetting 行は作られるが timeout 行はゼロ
    expect(await prisma.quizDefaultTimeout.count({ where: { userId: user.id } })).toBe(0);
  });

  test("throws when occurrence is outside scopedOwnerIds(userId)", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const bOcc = await createOccurrenceRow(b.id, "B's", 0);
    await expect(
      saveQuizDefaultsForUser(a.id, {
        occurrenceId: bOcc.id,
        rangeFrom: null,
        rangeTo: null,
        format: null,
        timeoutByFormat: timeoutMap({}),
        showCountdown: null,
        enableSound: null,
      }),
    ).rejects.toBeInstanceOf(DefaultOccurrenceNotInScopeError);
  });

  test("accepts a system-owned occurrence", async () => {
    const user = await createTestUser();
    const sysOcc = await createOccurrenceRow(SYSTEM_USER_ID, "system 追加分", 100);
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: sysOcc.id,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: timeoutMap({}),
      showCountdown: null,
      enableSound: null,
    });
    const defaults = await getQuizDefaultsForUser(user.id);
    expect(defaults?.occurrenceId).toBe(sysOcc.id);
  });
});

describe("getQuizDefaultsForUser", () => {
  test("returns null when nothing is saved", async () => {
    const user = await createTestUser();
    expect(await getQuizDefaultsForUser(user.id)).toBeNull();
  });

  test("returns saved values with full per-format timeout map", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "自前 location", 0);
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: 10,
      rangeTo: 20,
      format: "MULTI_MEANING",
      timeoutByFormat: timeoutMap({ MULTI_MEANING: 30 }),
      showCountdown: false,
      enableSound: false,
    });
    expect(await getQuizDefaultsForUser(user.id)).toEqual({
      occurrenceId: occ.id,
      rangeFrom: 10,
      rangeTo: 20,
      format: "MULTI_MEANING",
      timeoutByFormat: timeoutMap({ MULTI_MEANING: 30 }),
      showCountdown: false,
      enableSound: false,
    });
  });

  test("returns non-null when only per-format timeout is set (no QuizDefaultSetting row)", async () => {
    const user = await createTestUser();
    // QuizDefaultSetting を作らず timeout 行だけ直接挿入
    await prisma.quizDefaultTimeout.create({
      data: { userId: user.id, format: "CHOICE", timeoutSeconds: 7 },
    });
    expect(await getQuizDefaultsForUser(user.id)).toEqual({
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutByFormat: timeoutMap({ CHOICE: 7 }),
      showCountdown: null,
      enableSound: null,
    });
  });

  test("occurrence deletion clears only occurrenceId and does not touch per-format timeouts", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "削除予定", 0);
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: 1,
      rangeTo: 30,
      format: "CHOICE",
      timeoutByFormat: timeoutMap({ CHOICE: 5 }),
      showCountdown: false,
      enableSound: false,
    });

    await prisma.occurrence.delete({ where: { id: occ.id } });

    expect(await getQuizDefaultsForUser(user.id)).toEqual({
      occurrenceId: null,
      rangeFrom: 1,
      rangeTo: 30,
      format: "CHOICE",
      timeoutByFormat: timeoutMap({ CHOICE: 5 }),
      showCountdown: false,
      enableSound: false,
    });
  });
});

describe("clearQuizDefaultsForUser", () => {
  test("deletes both tables and is safe when nothing is saved (idempotent)", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "自前 location", 0);
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: null,
      rangeTo: null,
      format: "CHOICE",
      timeoutByFormat: timeoutMap({ CHOICE: 10, SELF_JUDGE: 15 }),
      showCountdown: false,
      enableSound: false,
    });

    await clearQuizDefaultsForUser(user.id);
    await clearQuizDefaultsForUser(user.id);

    expect(await getQuizDefaultsForUser(user.id)).toBeNull();
    expect(await prisma.quizDefaultTimeout.count({ where: { userId: user.id } })).toBe(0);
  });
});
