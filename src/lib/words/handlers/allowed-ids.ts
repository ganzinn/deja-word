import "server-only";

import { prisma } from "@/lib/prisma";

import { uniqueStrings } from "./shared";

import type { WordFormValues } from "@/lib/schema/word-form";

export type ChildAllowedIds = {
  linkedWordIds: Set<string>;
  presetOccurrenceIds: Set<string>;
};

/**
 * フォームが参照する linkedWordId / occurrenceId のうち、編集者のスコープ
 * （system + 自分）で実在するものだけを許可集合として解決する。トランザクション
 * の外で読み取り、handler はこの集合を信頼境界として使う。
 */
export async function resolveChildAllowedIds(
  _userId: string,
  values: WordFormValues,
  allowedOwnerIds: string[],
): Promise<ChildAllowedIds> {
  const linkedWordIds = uniqueStrings(values.relatedWords.map((r) => r.linkedWordId));
  const presetOccurrenceIds = uniqueStrings(values.occurrences.map((o) => o.occurrenceId));

  const [linkedWords, presetOccurrences] = await Promise.all([
    linkedWordIds.length > 0
      ? prisma.word.findMany({
          where: { id: { in: linkedWordIds }, ownerId: { in: allowedOwnerIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    presetOccurrenceIds.length > 0
      ? prisma.occurrence.findMany({
          where: { id: { in: presetOccurrenceIds }, ownerId: { in: allowedOwnerIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    linkedWordIds: new Set(linkedWords.map((w) => w.id)),
    presetOccurrenceIds: new Set(presetOccurrences.map((o) => o.id)),
  };
}
