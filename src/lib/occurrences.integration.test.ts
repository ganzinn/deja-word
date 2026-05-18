import { describe, expect, test } from "vitest";

import { getOccurrencePresetsForUser } from "@/lib/occurrences";
import { setPresetForUser } from "@/lib/occurrence-preset-settings";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import {
  SYSTEM_OCCURRENCE_LOCATIONS,
  createOccurrenceRow,
  createTestUser,
} from "../../tests/setup/fixtures";

describe("getOccurrencePresetsForUser", () => {
  test("returns the seeded system occurrences for a newly registered regular user", async () => {
    const user = await createTestUser();
    const presets = await getOccurrencePresetsForUser(user.id);
    expect(presets.map((p) => p.location)).toEqual(SYSTEM_OCCURRENCE_LOCATIONS);
    expect(presets.every((p) => p.ownerId === SYSTEM_USER_ID)).toBe(true);
  });

  test("A's ON/OFF does not affect B", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const target = SYSTEM_OCCURRENCE_LOCATIONS[0];
    const occ = await prisma.occurrence.findFirstOrThrow({
      where: { ownerId: SYSTEM_USER_ID, location: target },
      select: { id: true },
    });
    await setPresetForUser(a.id, occ.id, false);

    const presetsA = await getOccurrencePresetsForUser(a.id);
    const presetsB = await getOccurrencePresetsForUser(b.id);
    expect(presetsA.map((p) => p.location)).not.toContain(target);
    expect(presetsB.map((p) => p.location)).toContain(target);
  });

  test("system user's own preset toggle is independent from regular users", async () => {
    const user = await createTestUser();
    const target = SYSTEM_OCCURRENCE_LOCATIONS[0];
    const occ = await prisma.occurrence.findFirstOrThrow({
      where: { ownerId: SYSTEM_USER_ID, location: target },
      select: { id: true },
    });
    await setPresetForUser(SYSTEM_USER_ID, occ.id, false);

    const presetsSystem = await getOccurrencePresetsForUser(SYSTEM_USER_ID);
    const presetsUser = await getOccurrencePresetsForUser(user.id);
    expect(presetsSystem.map((p) => p.location)).not.toContain(target);
    expect(presetsUser.map((p) => p.location)).toContain(target);
  });

  test("a newly created system occurrence does not auto-propagate to existing users", async () => {
    const existing = await createTestUser();
    await createOccurrenceRow(SYSTEM_USER_ID, "後から追加", 99);
    const presets = await getOccurrencePresetsForUser(existing.id);
    expect(presets.map((p) => p.location)).not.toContain("後から追加");
  });

  test("user can opt-in to a newly added system occurrence via setPresetForUser", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, "後から追加 2", 100);
    await setPresetForUser(user.id, occ.id, true);
    const presets = await getOccurrencePresetsForUser(user.id);
    expect(presets.map((p) => p.location)).toContain("後から追加 2");
  });

  test("includes own occurrences only when they have a preset record", async () => {
    const user = await createTestUser();
    const ownPreset = await createOccurrenceRow(user.id, "自分の preset", 0, [user.id]);
    const ownNoPreset = await createOccurrenceRow(user.id, "自分の non-preset", 1);
    const presets = await getOccurrencePresetsForUser(user.id);
    const ids = presets.map((p) => p.id);
    expect(ids).toContain(ownPreset.id);
    expect(ids).not.toContain(ownNoPreset.id);
  });

  test("does not include other users' occurrences", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await createOccurrenceRow(b.id, "B's", 0, [b.id]);
    const presets = await getOccurrencePresetsForUser(a.id);
    expect(presets.map((p) => p.location)).not.toContain("B's");
  });
});
