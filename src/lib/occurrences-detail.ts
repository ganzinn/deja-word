import "server-only";

import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID, scopedOwnerIds } from "@/lib/system-user";

export type OccurrenceDetailResult = {
  id: string;
  ownerId: string;
  location: string;
  sortOrder: number;
  isSystem: boolean;
  isPreset: boolean;
  wordLinkCount: number;
};

export async function getOccurrenceForUser(
  userId: string,
  occurrenceId: string,
): Promise<OccurrenceDetailResult | null> {
  const row = await prisma.occurrence.findFirst({
    where: {
      id: occurrenceId,
      ownerId: { in: scopedOwnerIds(userId) },
    },
    select: {
      id: true,
      ownerId: true,
      location: true,
      sortOrder: true,
      presetSettings: {
        where: { userId },
        select: { userId: true },
        take: 1,
      },
      _count: { select: { wordLinks: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.ownerId,
    location: row.location,
    sortOrder: row.sortOrder,
    isSystem: row.ownerId === SYSTEM_USER_ID,
    isPreset: row.presetSettings.length > 0,
    wordLinkCount: row._count.wordLinks,
  };
}
