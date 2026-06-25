import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

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
