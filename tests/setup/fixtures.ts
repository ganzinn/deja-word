import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

export const SYSTEM_OCCURRENCE_LOCATIONS = ["ターゲット1900", "システム英単語"];

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
}

export async function createTestUser(
  overrides: Partial<{ id: string; email: string; name: string }> = {},
) {
  const id = overrides.id ?? `u_${randomUUID()}`;
  return prisma.user.create({
    data: {
      id,
      email: overrides.email ?? `${id}@test.local`,
      name: overrides.name ?? "テストユーザー",
      emailVerified: true,
    },
  });
}

export async function createWordRow(ownerId: string, headword: string) {
  return prisma.word.create({
    data: { ownerId, headword },
    select: { id: true },
  });
}

export async function createOccurrenceRow(ownerId: string, location: string, sortOrder = 0) {
  return prisma.occurrence.create({
    data: { ownerId, location, sortOrder },
    select: { id: true },
  });
}

export async function getSystemOccurrence(location: string) {
  const row = await prisma.occurrence.findUnique({
    where: { ownerId_location: { ownerId: SYSTEM_USER_ID, location } },
    select: { id: true },
  });
  if (!row) throw new Error(`System occurrence not found: ${location}`);
  return row;
}
