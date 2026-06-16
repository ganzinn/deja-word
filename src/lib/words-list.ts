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

/** 掲載番号の並び順（昇順／降順）。掲載箇所単位表示で使う。 */
export type OccurrenceNumberOrder = "asc" | "desc";

/** 掲載箇所単位の一覧アイテム。単語の表示情報に掲載番号を足したもの。 */
export type WordOccurrenceListItem = WordListItem & {
  occurrenceNumber: number | null;
};

export type WordsByOccurrenceParams = {
  occurrenceId: string;
  q?: string;
  match: WordMatchMode;
  from?: number;
  to?: number;
  order: OccurrenceNumberOrder;
  skip: number;
  take: number;
};

export type WordsByOccurrenceResult = {
  items: WordOccurrenceListItem[];
  total: number;
};

/** 単語一覧の表示に必要な Word の select（listWordsForUser / listWordsByOccurrence で共有）。 */
const wordListSelect = {
  id: true,
  headword: true,
  ownerId: true,
  meanings: {
    orderBy: { sortOrder: "asc" as const },
    take: 1,
    select: {
      partOfSpeech: true,
      texts: {
        orderBy: { sortOrder: "asc" as const },
        select: { text: true },
      },
    },
  },
};

type WordListRow = {
  id: string;
  headword: string;
  ownerId: string;
  meanings: { partOfSpeech: string | null; texts: { text: string }[] }[];
};

function toWordListItem(row: WordListRow): WordListItem {
  const firstMeaning = row.meanings[0];
  return {
    id: row.id,
    headword: row.headword,
    ownerId: row.ownerId,
    isSystem: row.ownerId === SYSTEM_USER_ID,
    partOfSpeech: firstMeaning?.partOfSpeech ?? null,
    meaningTexts: firstMeaning?.texts.map((t) => t.text) ?? [],
  };
}

/** キーワード一致方法を Prisma の headword 条件に変換する。 */
function headwordCondition(q: string, match: WordMatchMode) {
  const key = match === "prefix" ? "startsWith" : match === "suffix" ? "endsWith" : "contains";
  return { [key]: q, mode: "insensitive" as const };
}

export async function listWordsForUser(
  userId: string,
  params: WordListParams,
): Promise<WordListResult> {
  const q = params.q?.trim() ?? "";
  const where = {
    ownerId: { in: scopedOwnerIds(userId) },
    ...(q.length > 0 ? { headword: headwordCondition(q, params.match) } : {}),
  };

  const orderBy =
    params.sort === "recent"
      ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
      : [{ headword: "asc" as const }, { id: "asc" as const }];

  const [rows, total] = await Promise.all([
    prisma.word.findMany({
      where,
      select: wordListSelect,
      orderBy,
      skip: params.skip,
      take: params.take,
    }),
    prisma.word.count({ where }),
  ]);

  return { items: rows.map(toWordListItem), total };
}

/**
 * 指定した掲載箇所に登録された単語を、掲載番号順に取得する（自分＋システムのスコープ）。
 * - 掲載番号の範囲（from/to）を指定すると範囲外と掲載番号なし(null)は除外される。
 * - 範囲未指定なら掲載番号なしは末尾に表示する（order が昇順／降順いずれでも末尾）。
 */
export async function listWordsByOccurrence(
  userId: string,
  params: WordsByOccurrenceParams,
): Promise<WordsByOccurrenceResult> {
  const q = params.q?.trim() ?? "";
  const hasRange = params.from !== undefined || params.to !== undefined;
  const numberFilter: { gte?: number; lte?: number } = {};
  if (params.from !== undefined) numberFilter.gte = params.from;
  if (params.to !== undefined) numberFilter.lte = params.to;

  const where = {
    occurrenceId: params.occurrenceId,
    ownerId: { in: scopedOwnerIds(userId) },
    ...(hasRange ? { occurrenceNumber: numberFilter } : {}),
    ...(q.length > 0 ? { word: { headword: headwordCondition(q, params.match) } } : {}),
  };

  const orderBy = [
    { occurrenceNumber: { sort: params.order, nulls: "last" as const } },
    { word: { headword: "asc" as const } },
  ];

  const [rows, total] = await Promise.all([
    prisma.wordOccurrence.findMany({
      where,
      select: {
        occurrenceNumber: true,
        word: { select: wordListSelect },
      },
      orderBy,
      skip: params.skip,
      take: params.take,
    }),
    prisma.wordOccurrence.count({ where }),
  ]);

  const items: WordOccurrenceListItem[] = rows.map((row) => ({
    ...toWordListItem(row.word),
    occurrenceNumber: row.occurrenceNumber,
  }));

  return { items, total };
}
