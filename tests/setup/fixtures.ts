import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

export const SYSTEM_OCCURRENCE_LOCATIONS = ["ターゲット1900", "システム英単語"];

async function seedOccurrencePresetForUser(userId: string) {
  const systemOccurrences = await prisma.occurrence.findMany({
    where: { ownerId: SYSTEM_USER_ID },
    select: { id: true },
  });
  if (systemOccurrences.length === 0) return;
  await prisma.occurrencePresetSetting.createMany({
    data: systemOccurrences.map((o) => ({ userId, occurrenceId: o.id })),
    skipDuplicates: true,
  });
}

export async function seedSystemFixtures() {
  await prisma.user.create({
    data: {
      id: SYSTEM_USER_ID,
      email: "system@deja-word.internal",
      name: "共通",
      emailVerified: true,
    },
  });
  for (const [i, location] of SYSTEM_OCCURRENCE_LOCATIONS.entries()) {
    await prisma.occurrence.create({
      data: { ownerId: SYSTEM_USER_ID, location, sortOrder: i },
    });
  }
  await seedOccurrencePresetForUser(SYSTEM_USER_ID);
}

export async function createTestUser(
  overrides: Partial<{ id: string; email: string; name: string }> = {},
) {
  const id = overrides.id ?? `u_${randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      id,
      email: overrides.email ?? `${id}@test.local`,
      name: overrides.name ?? "テストユーザー",
      emailVerified: true,
    },
  });
  await seedOccurrencePresetForUser(user.id);
  return user;
}

export async function createWordRow(ownerId: string, headword: string) {
  return prisma.word.create({
    data: { ownerId, headword },
    select: { id: true },
  });
}

export async function createOccurrenceRow(
  ownerId: string,
  location: string,
  sortOrder = 0,
  presetForUserIds?: string[],
) {
  const occurrence = await prisma.occurrence.create({
    data: { ownerId, location, sortOrder },
    select: { id: true },
  });
  if (presetForUserIds && presetForUserIds.length > 0) {
    await prisma.occurrencePresetSetting.createMany({
      data: presetForUserIds.map((userId) => ({ userId, occurrenceId: occurrence.id })),
      skipDuplicates: true,
    });
  }
  return occurrence;
}

export async function getSystemOccurrence(location: string) {
  const row = await prisma.occurrence.findUnique({
    where: { ownerId_location: { ownerId: SYSTEM_USER_ID, location } },
    select: { id: true },
  });
  if (!row) throw new Error(`System occurrence not found: ${location}`);
  return row;
}
