import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

export async function getWordDetailForUser(userId: string, wordId: string) {
  const allowed = scopedOwnerIds(userId);
  return prisma.word.findFirst({
    where: { id: wordId, ownerId: { in: allowed } },
    include: {
      meanings: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
        include: {
          texts: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
          notes: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      examples: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
        include: {
          notes: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      relatedWords: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
        include: {
          linkedWord: { select: { id: true, headword: true } },
          notes: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      memos: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
      },
      wordOccurrences: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
        include: {
          occurrence: { select: { id: true, ownerId: true, location: true } },
          details: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
}

export type WordDetail = NonNullable<Awaited<ReturnType<typeof getWordDetailForUser>>>;
