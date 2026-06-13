import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  DefaultOccurrenceNotInScopeError,
  clearQuizDefaultsForUser,
  getQuizDefaultsForUser,
  saveQuizDefaultsForUser,
} from "@/lib/quiz-default-settings";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createOccurrenceRow, createTestUser } from "../../tests/setup/fixtures";

describe("saveQuizDefaultsForUser", () => {
  test("creates one row and re-save updates it in place", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "自前 location", 0);

    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: 1,
      rangeTo: 100,
      format: "CHOICE",
      timeoutSeconds: 5,
      showCountdown: true,
    });
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: null,
      rangeTo: 50,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      showCountdown: false,
    });

    const rows = await prisma.quizDefaultSetting.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      occurrenceId: occ.id,
      rangeFrom: null,
      rangeTo: 50,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      showCountdown: false,
    });
  });

  test("accepts all-null defaults", async () => {
    const user = await createTestUser();
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutSeconds: null,
      showCountdown: null,
    });
    const defaults = await getQuizDefaultsForUser(user.id);
    expect(defaults).toEqual({
      occurrenceId: null,
      rangeFrom: null,
      rangeTo: null,
      format: null,
      timeoutSeconds: null,
      showCountdown: null,
    });
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
        timeoutSeconds: null,
        showCountdown: null,
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
      timeoutSeconds: null,
      showCountdown: null,
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

  test("returns saved values", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "自前 location", 0);
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: 10,
      rangeTo: 20,
      format: "MULTI_MEANING",
      timeoutSeconds: 30,
      showCountdown: false,
    });
    expect(await getQuizDefaultsForUser(user.id)).toEqual({
      occurrenceId: occ.id,
      rangeFrom: 10,
      rangeTo: 20,
      format: "MULTI_MEANING",
      timeoutSeconds: 30,
      showCountdown: false,
    });
  });

  test("occurrence deletion clears only occurrenceId (DB SetNull), keeping range / format", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "削除予定", 0);
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: 1,
      rangeTo: 30,
      format: "CHOICE",
      timeoutSeconds: 5,
      showCountdown: false,
    });

    await prisma.occurrence.delete({ where: { id: occ.id } });

    expect(await getQuizDefaultsForUser(user.id)).toEqual({
      occurrenceId: null,
      rangeFrom: 1,
      rangeTo: 30,
      format: "CHOICE",
      timeoutSeconds: 5,
      showCountdown: false,
    });
  });
});

describe("clearQuizDefaultsForUser", () => {
  test("deletes the row and is safe when nothing is saved (idempotent)", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "自前 location", 0);
    await saveQuizDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: null,
      rangeTo: null,
      format: "CHOICE",
      timeoutSeconds: 10,
      showCountdown: false,
    });

    await clearQuizDefaultsForUser(user.id);
    await clearQuizDefaultsForUser(user.id);

    expect(await getQuizDefaultsForUser(user.id)).toBeNull();
  });
});
