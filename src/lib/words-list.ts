import "server-only";

import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID, scopedOwnerIds } from "@/lib/system-user";

export type WordListSort = "recent" | "headword";

export type WordMatchMode = "prefix" | "contains" | "suffix";

export type WordListItem = {
  id: string;
  headword: string;
  ownerId: string;
  isSystem: boolean;
  partOfSpeech: string | null;
  meaningTexts: string[];
};

export type WordListParams = {
  q?: string;
  sort: WordListSort;
  match: WordMatchMode;
  skip: number;
  take: number;
};

export type WordListResult = {
  items: WordListItem[];
  total: number;
};

export async function listWordsForUser(
  userId: string,
  params: WordListParams,
): Promise<WordListResult> {
  const q = params.q?.trim() ?? "";
  const matchFilterKey =
    params.match === "prefix" ? "startsWith" : params.match === "suffix" ? "endsWith" : "contains";
  const where = {
    ownerId: { in: scopedOwnerIds(userId) },
    ...(q.length > 0
      ? { headword: { [matchFilterKey]: q, mode: "insensitive" as const } }
      : {}),
  };

  const orderBy =
    params.sort === "recent"
      ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
      : [{ headword: "asc" as const }, { id: "asc" as const }];

  const [rows, total] = await Promise.all([
    prisma.word.findMany({
      where,
      select: {
        id: true,
        headword: true,
        ownerId: true,
        meanings: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: {
            partOfSpeech: true,
            texts: {
              orderBy: { sortOrder: "asc" },
              select: { text: true },
            },
          },
        },
      },
      orderBy,
      skip: params.skip,
      take: params.take,
    }),
    prisma.word.count({ where }),
  ]);

  const items: WordListItem[] = rows.map((row) => {
    const firstMeaning = row.meanings[0];
    return {
      id: row.id,
      headword: row.headword,
      ownerId: row.ownerId,
      isSystem: row.ownerId === SYSTEM_USER_ID,
      partOfSpeech: firstMeaning?.partOfSpeech ?? null,
      meaningTexts: firstMeaning?.texts.map((t) => t.text) ?? [],
    };
  });

  return { items, total };
}
