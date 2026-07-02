import "server-only";

import type { Prisma } from "@/generated/prisma/client";
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
  pronunciationAudioUrl: string | null;
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
      pronunciationAudioUrl: true,
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
  meanings: {
    partOfSpeech: string | null;
    pronunciationAudioUrl: string | null;
    texts: { text: string }[];
  }[];
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
    pronunciationAudioUrl: firstMeaning?.pronunciationAudioUrl ?? null,
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

/** 掲載箇所単位の絞り込み条件（一覧と隣接取得で共有し、集合の定義が乖離しないようにする）。 */
function buildWordsByOccurrenceWhere(
  userId: string,
  params: Pick<WordsByOccurrenceParams, "occurrenceId" | "q" | "match" | "from" | "to">,
): Prisma.WordOccurrenceWhereInput {
  const q = params.q?.trim() ?? "";
  const hasRange = params.from !== undefined || params.to !== undefined;
  const numberFilter: { gte?: number; lte?: number } = {};
  if (params.from !== undefined) numberFilter.gte = params.from;
  if (params.to !== undefined) numberFilter.lte = params.to;

  return {
    occurrenceId: params.occurrenceId,
    ownerId: { in: scopedOwnerIds(userId) },
    ...(hasRange ? { occurrenceNumber: numberFilter } : {}),
    ...(q.length > 0 ? { word: { headword: headwordCondition(q, params.match) } } : {}),
  };
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
  const where = buildWordsByOccurrenceWhere(userId, params);

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

/** 隣接単語ナビの参照情報（前後の単語へのリンク生成に使う）。 */
export type AdjacentWordRef = {
  id: string;
  headword: string;
  occurrenceNumber: number | null;
};

/**
 * 隣接単語の取得結果。null は「現在の単語がその絞り込み集合に含まれない」ことを表し、
 * 呼び出し側はナビ自体を表示しない。
 */
export type AdjacentWordsResult = {
  current: { occurrenceNumber: number | null };
  prev: AdjacentWordRef | null;
  next: AdjacentWordRef | null;
} | null;

export type AdjacentWordsParams = {
  occurrenceId: string;
  wordId: string;
  q?: string;
  match: WordMatchMode;
  from?: number;
  to?: number;
  order: OccurrenceNumberOrder;
};

const adjacentWordSelect = {
  occurrenceNumber: true,
  word: { select: { id: true, headword: true } },
};

type AdjacentWordRow = {
  occurrenceNumber: number | null;
  word: { id: string; headword: string };
};

function toAdjacentWordRef(row: AdjacentWordRow | null): AdjacentWordRef | null {
  if (row === null) return null;
  return {
    id: row.word.id,
    headword: row.word.headword,
    occurrenceNumber: row.occurrenceNumber,
  };
}

/**
 * 掲載箇所一覧（listWordsByOccurrence）と同じ絞り込み・並び順における前後の単語を取得する。
 * ソートキー（掲載番号 → 見出し語）のタプル比較で隣接を引くため、一覧のページ位置に依存しない。
 * - 現在の単語が絞り込み集合に含まれない場合（URL 改ざん・編集後など）は null を返す。
 * - 掲載番号なし(null)×同一見出し語の並びは一覧の orderBy 自体が順序保証しないため、隣接でも保証しない。
 */
export async function findAdjacentWordsByOccurrence(
  userId: string,
  params: AdjacentWordsParams,
): Promise<AdjacentWordsResult> {
  const baseWhere = buildWordsByOccurrenceWhere(userId, params);

  const current = await prisma.wordOccurrence.findFirst({
    where: { AND: [baseWhere, { wordId: params.wordId }] },
    select: { occurrenceNumber: true, word: { select: { headword: true } } },
  });
  if (current === null) return null;

  const n = current.occurrenceNumber;
  const h = current.word.headword;

  // 一覧の並び（掲載番号 order → 見出し語 asc、番号なしは末尾）における前後条件。
  // 見出し語 tiebreak は order によらず常に昇順なので gt/lt は反転しない。
  const nextCondition: Prisma.WordOccurrenceWhereInput =
    n === null
      ? { occurrenceNumber: null, word: { headword: { gt: h } } }
      : {
          OR: [
            { occurrenceNumber: n, word: { headword: { gt: h } } },
            { occurrenceNumber: params.order === "asc" ? { gt: n } : { lt: n } },
            // 範囲(from/to)指定時は baseWhere との AND で空になり、自然に除外される
            { occurrenceNumber: null },
          ],
        };
  const prevCondition: Prisma.WordOccurrenceWhereInput =
    n === null
      ? {
          OR: [
            { occurrenceNumber: null, word: { headword: { lt: h } } },
            { occurrenceNumber: { not: null } },
          ],
        }
      : {
          OR: [
            { occurrenceNumber: n, word: { headword: { lt: h } } },
            { occurrenceNumber: params.order === "asc" ? { lt: n } : { gt: n } },
          ],
        };

  const invertedOrder: OccurrenceNumberOrder = params.order === "asc" ? "desc" : "asc";

  const [prevRow, nextRow] = await Promise.all([
    prisma.wordOccurrence.findFirst({
      where: { AND: [baseWhere, prevCondition] },
      select: adjacentWordSelect,
      orderBy: [
        { occurrenceNumber: { sort: invertedOrder, nulls: "first" as const } },
        { word: { headword: "desc" as const } },
      ],
    }),
    prisma.wordOccurrence.findFirst({
      where: { AND: [baseWhere, nextCondition] },
      select: adjacentWordSelect,
      orderBy: [
        { occurrenceNumber: { sort: params.order, nulls: "last" as const } },
        { word: { headword: "asc" as const } },
      ],
    }),
  ]);

  return {
    current: { occurrenceNumber: n },
    prev: toAdjacentWordRef(prevRow),
    next: toAdjacentWordRef(nextRow),
  };
}

/**
 * 掲載箇所全体を掲載番号の昇順で前後移動するときの隣接単語を取得する（テスト結果ダイアログ用）。
 * 範囲・検索語は考慮しない。掲載番号なし(null)の単語はナビ対象外（現在の単語が番号なしなら null）。
 */
export async function findAdjacentWordsByOccurrenceNumber(
  userId: string,
  occurrenceId: string,
  wordId: string,
): Promise<AdjacentWordsResult> {
  const ownerScope = { in: scopedOwnerIds(userId) };

  const current = await prisma.wordOccurrence.findFirst({
    where: { occurrenceId, wordId, ownerId: ownerScope },
    select: { occurrenceNumber: true },
  });
  if (current === null || current.occurrenceNumber === null) return null;

  const n = current.occurrenceNumber;
  // @@unique([occurrenceId, occurrenceNumber]) により番号だけで順序が決まる（tiebreak 不要）
  const [prevRow, nextRow] = await Promise.all([
    prisma.wordOccurrence.findFirst({
      where: { occurrenceId, ownerId: ownerScope, occurrenceNumber: { lt: n } },
      select: adjacentWordSelect,
      orderBy: { occurrenceNumber: "desc" },
    }),
    prisma.wordOccurrence.findFirst({
      where: { occurrenceId, ownerId: ownerScope, occurrenceNumber: { gt: n } },
      select: adjacentWordSelect,
      orderBy: { occurrenceNumber: "asc" },
    }),
  ]);

  return {
    current: { occurrenceNumber: n },
    prev: toAdjacentWordRef(prevRow),
    next: toAdjacentWordRef(nextRow),
  };
}
