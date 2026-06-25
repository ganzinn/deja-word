import { describe, expect, test } from "vitest";

import {
  PresetOccurrenceNotInScopeError,
  setPresetForUser,
} from "@/lib/occurrence-preset-settings";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import {
  SYSTEM_OCCURRENCE_LOCATIONS,
  createOccurrenceRow,
  createTestUser,
} from "../../tests/setup/fixtures";

describe("setPresetForUser", () => {
  test("isPreset=true creates a record (upsert) and the second call is a no-op", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "自前 location", 0);
    await setPresetForUser(user.id, occ.id, true);
    await setPresetForUser(user.id, occ.id, true);
    const count = await prisma.occurrencePresetSetting.count({
      where: { userId: user.id, occurrenceId: occ.id },
    });
    expect(count).toBe(1);
  });

  test("isPreset=false deletes the record, and is safe even when record is absent", async () => {
    const user = await createTestUser();
    const target = SYSTEM_OCCURRENCE_LOCATIONS[0];
    const occ = await prisma.occurrence.findFirstOrThrow({
      where: { ownerId: SYSTEM_USER_ID, location: target },
      select: { id: true },
    });
    await setPresetForUser(user.id, occ.id, false);
    await setPresetForUser(user.id, occ.id, false);
    const count = await prisma.occurrencePresetSetting.count({
      where: { userId: user.id, occurrenceId: occ.id },
    });
    expect(count).toBe(0);
  });

  test("throws when occurrence is outside scopedOwnerIds(userId)", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const bOcc = await createOccurrenceRow(b.id, "B's", 0);
    await expect(setPresetForUser(a.id, bOcc.id, true)).rejects.toBeInstanceOf(
      PresetOccurrenceNotInScopeError,
    );
  });

  test("regular user can opt-in to a system-owned occurrence", async () => {
    const user = await createTestUser();
    const newSysOcc = await createOccurrenceRow(SYSTEM_USER_ID, "後追加", 100);
    await setPresetForUser(user.id, newSysOcc.id, true);
    const count = await prisma.occurrencePresetSetting.count({
      where: { userId: user.id, occurrenceId: newSysOcc.id },
    });
    expect(count).toBe(1);
  });
});
