import "server-only";

import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

/**
 * 対象 Occurrence がユーザーに可視であることを確認する（不在・不可視なら
 * OccurrenceNotFoundError）。問題生成・プレビューの両経路で契約を共有する。
 */
export async function assertOccurrenceVisible(userId: string, occurrenceId: string): Promise<void> {
  const allowed = scopedOwnerIds(userId);
  const occurrence = await prisma.occurrence.findFirst({
    where: { id: occurrenceId, ownerId: { in: allowed } },
    select: { id: true },
  });
  if (!occurrence) throw new OccurrenceNotFoundError();
}

/**
 * 問題生成・drill ラウンド生成の素材を 1 クエリで取得する。
 *
 * ユーザーの全可視単語（可視 MeaningText が 1 件以上あるもの）を一括取得し、
 * 対象 Occurrence への紐付き（occurrenceNumber）を wordOccurrences に含める。
 * 行の分割（出題対象／同一 Occurrence プール／全登録プール）はチケット 03 の
 * 純関数 partitionMaterial に委ねる。
 *
 * プレビューはこの重い経路を使わず、件数のみを `countQuizTargets` /
 * `countQuizSourceExclusions` で取得する（05-architecture.md 決定 8 改訂）。
 */
export async function fetchQuizSource(userId: string, occurrenceId: string) {
  const allowed = scopedOwnerIds(userId);
  await assertOccurrenceVisible(userId, occurrenceId);

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

/**
 * 出題対象（target）の件数を count クエリで返す。プレビューの軽量経路用。
 *
 * partitionMaterial の target 定義と一致させる: 可視 MeaningText を 1 件以上持ち、かつ
 * 対象 Occurrence に occurrenceNumber 非 null かつ範囲内の wordOccurrence を持つ単語。
 * 範囲（from/to）は未指定なら制限なし。
 */
export async function countQuizTargets(
  userId: string,
  occurrenceId: string,
  range: { from?: number; to?: number },
): Promise<number> {
  const allowed = scopedOwnerIds(userId);
  return prisma.word.count({
    where: {
      ownerId: { in: allowed },
      meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } },
      wordOccurrences: {
        some: {
          occurrenceId,
          ownerId: { in: allowed },
          occurrenceNumber: {
            not: null,
            ...(range.from !== undefined ? { gte: range.from } : {}),
            ...(range.to !== undefined ? { lte: range.to } : {}),
          },
        },
      },
    },
  });
}
