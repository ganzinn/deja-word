import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeSearchKeyword } from "@/lib/search-keyword";
import { SYSTEM_USER_ID, scopedOwnerIds } from "@/lib/system-user";

export type WordSuggestion = {
  id: string;
  headword: string;
  ownerId: string;
  isSystem: boolean;
};

export async function searchWordsForLink(
  userId: string,
  query: string,
  limit = 10,
): Promise<WordSuggestion[]> {
  const q = normalizeSearchKeyword(query);
  if (q.length === 0) return [];

  const take = Math.min(Math.max(limit, 1), 20);
  const rows = await prisma.word.findMany({
    where: {
      ownerId: { in: scopedOwnerIds(userId) },
      headword: { contains: q, mode: "insensitive" },
    },
    select: { id: true, headword: true, ownerId: true },
    orderBy: [{ headword: "asc" }],
    take,
  });

  const mapped = rows.map((r) => ({
    id: r.id,
    headword: r.headword,
    ownerId: r.ownerId,
    isSystem: r.ownerId === SYSTEM_USER_ID,
  }));

  return [...mapped.filter((r) => !r.isSystem), ...mapped.filter((r) => r.isSystem)];
}
