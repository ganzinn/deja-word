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
 * 補完ダミープール（対象 Occurrence 外の全登録単語）の取得上限。
 *
 * 補完ダミーは `selectDummies` の fallback で、同一 Occurrence 由来の優先プールが
 * 不足したときだけ使う。ダミーは 1 問あたり数件・問題間で使い回せるため、全コーパスを
 * 読まず一定数のサンプルで足りる（05-architecture.md 決定 8・2026-06-21 追補）。
 */
export const FALLBACK_POOL_LIMIT = 100;

/**
 * 問題生成・drill ラウンド生成の素材を取得する。
 *
 * 出題対象（範囲内の単語）は必ず全件必要なので、対象 Occurrence に紐づく単語
 * （`occurrenceRows`＝出題対象＋同一 Occurrence プール）は上限なしで取得する。
 * 一方、Occurrence 外の全登録単語は補完ダミー専用（不足時のみ使用）なので、
 * `fallbackRows` として最大 {@link FALLBACK_POOL_LIMIT} 件にサンプリングする。
 * 行の分割（出題対象／同一 Occurrence プール／全登録プール）はチケット 03 の
 * 純関数 partitionMaterial に委ねる。
 *
 * プレビューはこの重い経路を使わず、件数のみを `countQuizTargets` /
 * `countQuizSourceExclusions` で取得する（05-architecture.md 決定 8 改訂）。
 */
export async function fetchQuizSource(userId: string, occurrenceId: string) {
  const allowed = scopedOwnerIds(userId);
  await assertOccurrenceVisible(userId, occurrenceId);

  const hasVisibleMeaning = {
    meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } },
  } as const;
  const linkedToOccurrence = {
    wordOccurrences: { some: { occurrenceId, ownerId: { in: allowed } } },
  } as const;
  const select = {
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
  } as const;

  const [occurrenceRows, fallbackRows] = await Promise.all([
    prisma.word.findMany({
      where: { ownerId: { in: allowed }, ...hasVisibleMeaning, ...linkedToOccurrence },
      select,
    }),
    prisma.word.findMany({
      where: { ownerId: { in: allowed }, ...hasVisibleMeaning, NOT: linkedToOccurrence },
      select,
      orderBy: { createdAt: "desc" },
      take: FALLBACK_POOL_LIMIT,
    }),
  ]);

  return { occurrenceRows, fallbackRows };
}

export type QuizSourceRow = Awaited<ReturnType<typeof fetchQuizSource>>["occurrenceRows"][number];

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
