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
 * ダミー候補プールの目標件数（出題対象を含む）。
 *
 * ダミー（誤答選択肢）は `selectDummies` で使い、優先プール（出題対象 ∪ 同一 Occurrence の範囲外単語）→
 * 補完プール（Occurrence 外の全登録単語）の順で選ぶ。**出題対象（targets）自身も優先プールの候補**に
 * なるため、targets が十分あればダミー専用の取得は不要。よって候補プールがこの件数に達するよう、
 * targets → 同一 Occurrence（範囲外）→ 他 Occurrence の優先順で**不足分だけ**取得する。
 * ダミーは 1 問あたり数件・問題間で使い回せるため、この件数あれば dedup 後も充足する
 * （05-architecture.md 決定 8・2026-06-21 追補）。
 */
export const DUMMY_POOL_SIZE = 50;

/**
 * 問題生成・drill ラウンド生成の素材を取得する。
 *
 * 範囲（range）判定を SQL に寄せ、ダミー候補プールを {@link DUMMY_POOL_SIZE} 件まで優先順で
 * **不足分だけ**取得する（最大 3 クエリ、逐次）:
 * - `targetRows`: 範囲内の出題対象。仕様『範囲内全出題』のため上限なしで全件取得。
 * - `sameOccurrenceRows`: 同一 Occurrence の範囲外・番号なし単語（優先ダミー）。
 *   不足分 `DUMMY_POOL_SIZE - targets` 件だけ取得（0 なら取得しない）。
 * - `fallbackRows`: Occurrence 外の全登録単語（補完ダミー）。
 *   残りの不足分 `DUMMY_POOL_SIZE - targets - sameOccurrence` 件だけ取得（0 なら取得しない）。
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

  // 出題対象は全件取得。
  const targetRows = await prisma.word.findMany({
    where: { ownerId: { in: allowed }, ...hasVisibleMeaning, ...inRangeWordOccurrence },
    select,
  });

  // ダミー候補プールを DUMMY_POOL_SIZE 件まで、同一 Occurrence（範囲外）→ 他 Occurrence の
  // 順で不足分だけ補う。fallback の取得数は同一 Occurrence の実取得数に依存するため逐次。
  const sameOccTake = Math.max(0, DUMMY_POOL_SIZE - targetRows.length);
  const sameOccurrenceRows =
    sameOccTake === 0
      ? []
      : await prisma.word.findMany({
          where: {
            ownerId: { in: allowed },
            ...hasVisibleMeaning,
            ...linkedToOccurrence,
            NOT: inRangeWordOccurrence,
          },
          select,
          orderBy: { createdAt: "desc" },
          take: sameOccTake,
        });

  const fallbackTake = Math.max(
    0,
    DUMMY_POOL_SIZE - targetRows.length - sameOccurrenceRows.length,
  );
  const fallbackRows =
    fallbackTake === 0
      ? []
      : await prisma.word.findMany({
          where: { ownerId: { in: allowed }, ...hasVisibleMeaning, NOT: linkedToOccurrence },
          select,
          orderBy: { createdAt: "desc" },
          take: fallbackTake,
        });

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
