import "server-only";

import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

export type OccurrencePreset = { id: string; location: string };

export async function getSystemOccurrencePresets(): Promise<OccurrencePreset[]> {
  return prisma.occurrence.findMany({
    where: { ownerId: SYSTEM_USER_ID },
    select: { id: true, location: true },
    orderBy: [{ sortOrder: "asc" }, { location: "asc" }],
  });
}
