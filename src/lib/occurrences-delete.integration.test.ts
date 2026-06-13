import { describe, expect, test } from "vitest";

import { deleteOccurrenceForUser } from "@/lib/occurrences-delete";
import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createOccurrenceRow, createTestUser, createWordRow } from "../../tests/setup/fixtures";

describe("deleteOccurrenceForUser", () => {
  test("cascades WordOccurrence and OccurrenceDetail and PresetSetting, leaves Word intact", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "to-delete", 0, [user.id]);
    const word = await createWordRow(user.id, "anchor");
    const wo = await prisma.wordOccurrence.create({
      data: { wordId: word.id, occurrenceId: occ.id, ownerId: user.id },
      select: { id: true },
    });
    await prisma.occurrenceDetail.create({
      data: { wordOccurrenceId: wo.id, ownerId: user.id, detail: "p.42" },
    });

    await deleteOccurrenceForUser(user.id, occ.id);

    const occRow = await prisma.occurrence.findUnique({ where: { id: occ.id } });
    expect(occRow).toBeNull();
    const woRow = await prisma.wordOccurrence.findUnique({ where: { id: wo.id } });
    expect(woRow).toBeNull();
    const detailCount = await prisma.occurrenceDetail.count({ where: { wordOccurrenceId: wo.id } });
    expect(detailCount).toBe(0);
    const settingCount = await prisma.occurrencePresetSetting.count({
      where: { occurrenceId: occ.id },
    });
    expect(settingCount).toBe(0);
    const wordRow = await prisma.word.findUnique({ where: { id: word.id } });
    expect(wordRow).not.toBeNull();
  });

  test("rejects deleting another user's occurrence", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const bOcc = await createOccurrenceRow(b.id, "B's", 0);
    await expect(deleteOccurrenceForUser(a.id, bOcc.id)).rejects.toBeInstanceOf(
      OccurrenceNotFoundError,
    );
  });

  test("regular user cannot delete a system occurrence", async () => {
    const user = await createTestUser();
    const sys = await prisma.occurrence.findFirstOrThrow({
      where: { ownerId: SYSTEM_USER_ID },
      select: { id: true },
    });
    await expect(deleteOccurrenceForUser(user.id, sys.id)).rejects.toBeInstanceOf(
      OccurrenceNotFoundError,
    );
  });
});
