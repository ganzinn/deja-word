import "server-only";

import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";

export async function deleteOccurrenceForUser(userId: string, occurrenceId: string): Promise<void> {
  const existing = await prisma.occurrence.findFirst({
    where: { id: occurrenceId, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new OccurrenceNotFoundError();
  await prisma.occurrence.delete({ where: { id: occurrenceId } });
}
