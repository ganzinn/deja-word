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
 * ダミー専用プールの取得上限。
 *
 * ダミー（誤答選択肢）は `selectDummies` で使う。同一 Occurrence の範囲外単語を優先プール、
 * Occurrence 外の全登録単語を補完プールにするが、どちらも出題対象ではなく「ダミー候補」専用。
 * ダミーは 1 問あたり数件・問題間で使い回せるうえ出題対象自身も相互にダミーになるため、
 * 全件読まず一定数のサンプルで足りる（05-architecture.md 決定 8・2026-06-21 追補）。
 */
export const SAME_OCCURRENCE_POOL_LIMIT = 100;
export const FALLBACK_POOL_LIMIT = 100;

/**
 * 問題生成・drill ラウンド生成の素材を取得する。
 *
 * 範囲（range）判定を SQL に寄せ、3 クエリに分割する:
 * - `targetRows`: 範囲内の出題対象。仕様『範囲内全出題』のため上限なしで全件取得。
 * - `sameOccurrenceRows`: 同一 Occurrence の範囲外・番号なし単語（優先ダミー専用）。
 *   最大 {@link SAME_OCCURRENCE_POOL_LIMIT} 件にサンプリング。
 * - `fallbackRows`: Occurrence 外の全登録単語（補完ダミー専用）。
 *   最大 {@link FALLBACK_POOL_LIMIT} 件にサンプリング。
 * 行→素材（targets / sameOccurrencePool / allWordsPool）の対応は純関数 partitionMaterial に委ねる。
 *
 * プレビューはこの重い経路を使わず、件数のみを `countQuizTargets` /
 * `countQuizSourceExclusions` で取得する（05-architecture.md 決定 8 改訂）。
 */
export async function fetchQuizSource(
  userId: string,
  occurrenceId: string,
  range: { from?: number; to?: number },
) {
  const allowed = scopedOwnerIds(userId);
  await assertOccurrenceVisible(userId, occurrenceId);

  const hasVisibleMeaning = {
    meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } },
  } as const;
  const linkedToOccurrence = {
    wordOccurrences: { some: { occurrenceId, ownerId: { in: allowed } } },
  } as const;
  // 出題対象の述語: occurrenceNumber が非 null かつ範囲内（`countQuizTargets` と一致）。
  const inRangeWordOccurrence = {
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
  } as const;

  const [targetRows, sameOccurrenceRows, fallbackRows] = await Promise.all([
    prisma.word.findMany({
      where: { ownerId: { in: allowed }, ...hasVisibleMeaning, ...inRangeWordOccurrence },
      select,
    }),
    prisma.word.findMany({
      where: {
        ownerId: { in: allowed },
        ...hasVisibleMeaning,
        ...linkedToOccurrence,
        NOT: inRangeWordOccurrence,
      },
      select,
      orderBy: { createdAt: "desc" },
      take: SAME_OCCURRENCE_POOL_LIMIT,
    }),
    prisma.word.findMany({
      where: { ownerId: { in: allowed }, ...hasVisibleMeaning, NOT: linkedToOccurrence },
      select,
      orderBy: { createdAt: "desc" },
      take: FALLBACK_POOL_LIMIT,
    }),
  ]);

  return { targetRows, sameOccurrenceRows, fallbackRows };
}

export type QuizSourceRow = Awaited<ReturnType<typeof fetchQuizSource>>["targetRows"][number];

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
