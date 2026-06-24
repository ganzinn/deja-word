import "server-only";

import type { QuizFormat } from "@/generated/prisma/enums";
import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";
import { DRILL_RESET_REMAINING } from "@/lib/quiz/generation/next-remaining";
import { scopedOwnerIds } from "@/lib/system-user";

/**
 * results に対象 Occurrence の番号付き可視単語が 1 件もなく、実効範囲
 * （rangeFrom / rangeTo）を計算できない場合のエラー。正規のテスト結果からは
 * 到達しない（出題対象は常に番号付き）ため、改ざん入力・極端な削除レースのみ。
 */
export class EmptyDrillResultsError extends Error {
  constructor() {
    super("EMPTY_DRILL_RESULTS");
    this.name = "EmptyDrillResultsError";
  }
}

/** 元テスト 1 問分の結果。ownerId は常にセッション由来のためここには含めない。 */
export type DrillResultInput = { wordId: string; correct: boolean };

/** 元テスト正解組の初期残数（1 回正解すれば定着）。誤答組は DRILL_RESET_REMAINING。 */
const INITIAL_REMAINING_CORRECT = 1;

/**
 * テスト結果画面の「定着モードへ」起点で drill を生成する（06-drill-mode.md 決定 2）。
 *
 * - 入力の results はクライアント申告（サーバーに「今回のテスト」を特定する手段が
 *   ないため。改ざんはカンニング許容方針と整合。05-architecture.md 決定 2）
 * - rangeFrom / rangeTo は results の単語の occurrenceNumber から実効範囲（min / max）を
 *   サーバーで計算して保存する（同 決定 2）
 * - 初期残数: 元テスト誤答=3 / 正答=1（06-drill-mode.md 決定 1）
 * - 結果画面表示中に削除された単語は存在確認フィルタで skip する（決定 3 と同形）
 */
export async function createDrillForUser(
  userId: string,
  input: {
    occurrenceId: string;
    format: QuizFormat;
    timeoutSeconds: number | null;
    choiceFirstMeaningTextOnly: boolean;
    results: DrillResultInput[];
  },
): Promise<{ drillId: string }> {
  const allowed = scopedOwnerIds(userId);
  const occurrence = await prisma.occurrence.findFirst({
    where: { id: input.occurrenceId, ownerId: { in: allowed } },
    select: { id: true },
  });
  if (!occurrence) throw new OccurrenceNotFoundError();

  return prisma.$transaction(async (tx) => {
    const wordIds = input.results.map((r) => r.wordId);
    const existing = await tx.word.findMany({
      where: { id: { in: wordIds }, ownerId: { in: allowed } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((w) => w.id));
    const results = input.results.filter((r) => existingIds.has(r.wordId));

    const links = await tx.wordOccurrence.findMany({
      where: {
        occurrenceId: input.occurrenceId,
        wordId: { in: results.map((r) => r.wordId) },
        ownerId: { in: allowed },
        occurrenceNumber: { not: null },
      },
      select: { occurrenceNumber: true },
    });
    const numbers = links.map((l) => l.occurrenceNumber).filter((n): n is number => n !== null);
    if (numbers.length === 0) throw new EmptyDrillResultsError();

    const drill = await tx.drill.create({
      data: {
        ownerId: userId,
        occurrenceId: input.occurrenceId,
        rangeFrom: Math.min(...numbers),
        rangeTo: Math.max(...numbers),
        format: input.format,
        timeoutSeconds: input.timeoutSeconds,
        choiceFirstMeaningTextOnly: input.choiceFirstMeaningTextOnly,
        words: {
          createMany: {
            data: results.map((r) => ({
              wordId: r.wordId,
              remaining: r.correct ? INITIAL_REMAINING_CORRECT : DRILL_RESET_REMAINING,
            })),
            skipDuplicates: true,
          },
        },
      },
      select: { id: true },
    });
    return { drillId: drill.id };
  });
}
