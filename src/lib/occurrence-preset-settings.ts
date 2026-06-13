import "server-only";

import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID, scopedOwnerIds } from "@/lib/system-user";

export async function seedOccurrencePresetSettingsForUser(userId: string): Promise<number> {
  const systemOccurrences = await prisma.occurrence.findMany({
    where: { ownerId: SYSTEM_USER_ID },
    select: { id: true },
  });
  if (systemOccurrences.length === 0) return 0;
  const result = await prisma.occurrencePresetSetting.createMany({
    data: systemOccurrences.map((o) => ({ userId, occurrenceId: o.id })),
    skipDuplicates: true,
  });
  return result.count;
}

export class PresetOccurrenceNotInScopeError extends Error {
  constructor() {
    super("preset occurrence is not in scope");
    this.name = "PresetOccurrenceNotInScopeError";
  }
}

export async function setPresetForUser(
  userId: string,
  occurrenceId: string,
  isPreset: boolean,
): Promise<void> {
  const occurrence = await prisma.occurrence.findFirst({
    where: { id: occurrenceId, ownerId: { in: scopedOwnerIds(userId) } },
    select: { id: true },
  });
  if (!occurrence) throw new PresetOccurrenceNotInScopeError();

  if (isPreset) {
    await prisma.occurrencePresetSetting.upsert({
      where: { userId_occurrenceId: { userId, occurrenceId } },
      create: { userId, occurrenceId },
      update: {},
    });
  } else {
    await prisma.occurrencePresetSetting.deleteMany({
      where: { userId, occurrenceId },
    });
  }
}
