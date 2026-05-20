import "server-only";

import { DuplicateOccurrenceLocationError } from "@/lib/occurrences-create";
import { isUniqueConstraintOn } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

export type OccurrenceUpdateInput = {
  location: string;
  isPreset: boolean;
};

export class OccurrenceNotFoundError extends Error {
  constructor() {
    super("OCCURRENCE_NOT_FOUND");
    this.name = "OccurrenceNotFoundError";
  }
}

export async function updateOccurrenceForUser(
  userId: string,
  occurrenceId: string,
  input: OccurrenceUpdateInput,
): Promise<void> {
  const location = input.location.trim();
  const existing = await prisma.occurrence.findFirst({
    where: { id: occurrenceId, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new OccurrenceNotFoundError();

  const conflict = await prisma.occurrence.findFirst({
    where: {
      ownerId: { in: scopedOwnerIds(userId) },
      location,
      NOT: { id: occurrenceId },
    },
    select: { id: true },
  });
  if (conflict) throw new DuplicateOccurrenceLocationError();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.occurrence.update({
        where: { id: occurrenceId },
        data: { location },
      });
      if (input.isPreset) {
        await tx.occurrencePresetSetting.upsert({
          where: { userId_occurrenceId: { userId, occurrenceId } },
          create: { userId, occurrenceId },
          update: {},
        });
      } else {
        await tx.occurrencePresetSetting.deleteMany({
          where: { userId, occurrenceId },
        });
      }
    });
  } catch (e) {
    if (isUniqueConstraintOn(e, "Occurrence")) {
      throw new DuplicateOccurrenceLocationError();
    }
    throw e;
  }
}
