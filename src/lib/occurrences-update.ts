import "server-only";

import {
  DuplicateOccurrenceLocationError,
  isDuplicateOccurrenceLocation,
} from "@/lib/occurrences-create";
import { prisma } from "@/lib/prisma";

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
    if (isDuplicateOccurrenceLocation(e)) {
      throw new DuplicateOccurrenceLocationError();
    }
    throw e;
  }
}
