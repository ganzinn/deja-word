import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

export type OccurrencePreset = { id: string; ownerId: string; location: string };

export async function getOccurrencePresetsForUser(userId: string): Promise<OccurrencePreset[]> {
  const rows = await prisma.occurrencePresetSetting.findMany({
    where: {
      userId,
      occurrence: { ownerId: { in: scopedOwnerIds(userId) } },
    },
    select: {
      occurrence: {
        select: { id: true, ownerId: true, location: true, sortOrder: true, createdAt: true },
      },
    },
  });
  // listOccurrencesForUser と同じ並び: own（全件 sortOrder=0）は createdAt 降順（新しい順）、
  // system は sortOrder(0,1) の固定順を維持。
  return rows
    .map((r) => r.occurrence)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        a.location.localeCompare(b.location),
    )
    .map(({ id, ownerId, location }) => ({ id, ownerId, location }));
}
