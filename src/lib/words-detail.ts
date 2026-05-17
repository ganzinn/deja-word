import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

export async function getWordDetailForUser(userId: string, wordId: string) {
  return prisma.word.findFirst({
    where: { id: wordId, ownerId: { in: scopedOwnerIds(userId) } },
    include: {
      meanings: {
        orderBy: { sortOrder: "asc" },
        include: { texts: { orderBy: { sortOrder: "asc" } } },
      },
      examples: { orderBy: { sortOrder: "asc" } },
      relatedWords: {
        orderBy: { sortOrder: "asc" },
        include: {
          linkedWord: { select: { id: true, headword: true } },
        },
      },
      memos: { orderBy: { sortOrder: "asc" } },
      wordOccurrences: {
        orderBy: { sortOrder: "asc" },
        include: {
          occurrence: { select: { id: true, ownerId: true, location: true } },
          details: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
}

export type WordDetail = NonNullable<Awaited<ReturnType<typeof getWordDetailForUser>>>;
