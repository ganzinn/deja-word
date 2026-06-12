import "server-only";

import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

/**
 * 問題生成・プレビューの素材を 1 クエリで取得する。
 *
 * ユーザーの全可視単語（可視 MeaningText が 1 件以上あるもの）を一括取得し、
 * 対象 Occurrence への紐付き（occurrenceNumber）を wordOccurrences に含める。
 * 行の分割（出題対象／同一 Occurrence プール／全登録プール）はチケット 03 の
 * 純関数 partitionMaterial に委ねる。
 */
export async function fetchQuizSource(userId: string, occurrenceId: string) {
  const allowed = scopedOwnerIds(userId);
  const occurrence = await prisma.occurrence.findFirst({
    where: { id: occurrenceId, ownerId: { in: allowed } },
    select: { id: true },
  });
  if (!occurrence) throw new OccurrenceNotFoundError();

  return prisma.word.findMany({
    where: {
      ownerId: { in: allowed },
      meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } },
    },
    select: {
      id: true,
      headword: true,
      meanings: {
        where: { ownerId: { in: allowed } },
        orderBy: { sortOrder: "asc" },
        select: {
          partOfSpeech: true,
          pronunciationAudioUrl: true,
          texts: {
            where: { ownerId: { in: allowed } },
            orderBy: { sortOrder: "asc" },
            select: { text: true },
          },
        },
      },
      wordOccurrences: {
        where: { occurrenceId, ownerId: { in: allowed } },
        select: { occurrenceNumber: true },
      },
    },
  });
}

export type QuizSourceRow = Awaited<ReturnType<typeof fetchQuizSource>>[number];

/**
 * 対象 Occurrence 内の除外内訳（番号なし・意味未登録）を count クエリで返す。
 *
 * 意味未登録の単語は fetchQuizSource の結果に現れないため、別途カウントする。
 * 2 つの件数は独立にカウントする（番号なしかつ意味未登録の単語は両方に数えられる）。
 */
export async function countQuizSourceExclusions(
  userId: string,
  occurrenceId: string,
): Promise<{ noNumber: number; noMeaning: number }> {
  const allowed = scopedOwnerIds(userId);
  const [noNumber, noMeaning] = await Promise.all([
    prisma.wordOccurrence.count({
      where: {
        occurrenceId,
        ownerId: { in: allowed },
        occurrenceNumber: null,
        word: { ownerId: { in: allowed } },
      },
    }),
    prisma.word.count({
      where: {
        ownerId: { in: allowed },
        wordOccurrences: { some: { occurrenceId, ownerId: { in: allowed } } },
        NOT: { meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } } },
      },
    }),
  ]);
  return { noNumber, noMeaning };
}
