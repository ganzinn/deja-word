import "server-only";

import { isUniqueConstraintOn } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

export type OccurrenceCreateInput = {
  location: string;
  isPreset: boolean;
  autoNumbering: boolean;
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
        // 自動採番はプリセット ON が前提（プリセットなしでは保持しない）
        data: { ownerId: userId, location, autoNumbering: input.isPreset && input.autoNumbering },
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
    if (isUniqueConstraintOn(e, "Occurrence")) {
      throw new DuplicateOccurrenceLocationError();
    }
    throw e;
  }
}
