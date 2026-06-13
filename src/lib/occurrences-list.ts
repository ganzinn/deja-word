import "server-only";

import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID, scopedOwnerIds } from "@/lib/system-user";

export type OccurrenceListItem = {
  id: string;
  ownerId: string;
  location: string;
  sortOrder: number;
  isSystem: boolean;
  isPreset: boolean;
  wordLinkCount: number;
};

export async function listOccurrencesForUser(userId: string): Promise<OccurrenceListItem[]> {
  const allowed = scopedOwnerIds(userId);
  const rows = await prisma.occurrence.findMany({
    where: { ownerId: { in: allowed } },
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
      _count: {
        select: { wordLinks: { where: { ownerId: { in: allowed } } } },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { location: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    ownerId: row.ownerId,
    location: row.location,
    sortOrder: row.sortOrder,
    isSystem: row.ownerId === SYSTEM_USER_ID,
    isPreset: row.presetSettings.length > 0,
    wordLinkCount: row._count.wordLinks,
  }));
}
