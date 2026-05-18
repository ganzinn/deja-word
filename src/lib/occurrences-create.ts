import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

export type OccurrenceCreateInput = {
  location: string;
  isPreset: boolean;
};

export class DuplicateOccurrenceLocationError extends Error {
  constructor() {
    super("DUPLICATE_OCCURRENCE_LOCATION");
    this.name = "DuplicateOccurrenceLocationError";
  }
}

export async function createOccurrenceForUser(
  userId: string,
  input: OccurrenceCreateInput,
): Promise<{ id: string }> {
  const location = input.location.trim();
  const conflict = await prisma.occurrence.findFirst({
    where: { ownerId: { in: scopedOwnerIds(userId) }, location },
    select: { id: true },
  });
  if (conflict) throw new DuplicateOccurrenceLocationError();
  try {
    return await prisma.$transaction(async (tx) => {
      const occ = await tx.occurrence.create({
        data: { ownerId: userId, location },
        select: { id: true },
      });
      if (input.isPreset) {
        await tx.occurrencePresetSetting.create({
          data: { userId, occurrenceId: occ.id },
        });
      }
      return occ;
    });
  } catch (e) {
    if (isDuplicateOccurrenceLocation(e)) {
      throw new DuplicateOccurrenceLocationError();
    }
    throw e;
  }
}

export function isDuplicateOccurrenceLocation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: unknown; meta?: { modelName?: unknown } };
  if (err.code !== "P2002") return false;
  return err.meta?.modelName === "Occurrence";
}
