import "server-only";

import type { QuizFormat, QuizResult } from "@/generated/prisma/enums";
import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";
import { DRILL_RESET_REMAINING, DRILL_VAGUE_REMAINING } from "@/lib/quiz/generation/next-remaining";
import { scopedOwnerIds } from "@/lib/system-user";

/**
 * Drill に入れる対象が 1 件もなく、実効範囲（rangeFrom / rangeTo）を計算できない場合のエラー。
 * 通常 UI からは到達しない:
 * - 出題対象は常に番号付きのため、番号なしだけになることはない
 * - 全問正解 ＋「誤答のみ」（drillIncludeCorrect=false）で対象が 0 件になるケースは、
 *   結果画面側で「定着モードをはじめる」を無効化してガードしている
 * よってサーバーで到達するのは改ざん入力・極端な削除レースのみ。
 */
export class EmptyDrillResultsError extends Error {
  constructor() {
    super("EMPTY_DRILL_RESULTS");
    this.name = "EmptyDrillResultsError";
  }
}

/** 元テスト 1 問分の結果。ownerId は常にセッション由来のためここには含めない。 */
export type DrillResultInput = { wordId: string; result: QuizResult };

/** 元テスト正解組の初期残数（1 回正解すれば定着）。誤答組は DRILL_RESET_REMAINING、
 *  うろ覚え（VAGUE）組は DRILL_VAGUE_REMAINING。
 *  正解組は drillIncludeCorrect=true のときだけ投入されるため、この値は ON 時のみ使われる。 */
const INITIAL_REMAINING_CORRECT = 1;

/** result から drill 投入の初期残数を導出する（正答=1 / うろ覚え=2 / それ以外=3）。 */
function initialRemainingFor(result: QuizResult): number {
  if (result === "CORRECT") return INITIAL_REMAINING_CORRECT;
  if (result === "VAGUE") return DRILL_VAGUE_REMAINING;
  return DRILL_RESET_REMAINING;
}

/**
 * テスト結果画面の「定着モードへ」起点で drill を生成する（06-drill-mode.md 決定 2）。
 *
 * - 入力の results はクライアント申告（サーバーに「今回のテスト」を特定する手段が
 *   ないため。改ざんはカンニング許容方針と整合。05-architecture.md 決定 2）
 * - 既定（drillIncludeCorrect=false）は誤答とうろ覚えを投入する。true で正答単語も投入する
 *   （結果画面トグル「正解した問題も定着モードで出題する」由来）。うろ覚え（VAGUE）は
 *   トグルに関係なく常に投入する（正解後にうろ覚えへ降格した＝復習したい意思表示のため）
 * - rangeFrom / rangeTo は投入対象の単語の occurrenceNumber から実効範囲（min / max）を
 *   サーバーで計算して保存する（同 決定 2）
 * - 初期残数: 元テスト誤答=3 / うろ覚え=2 / 正答=1（正答は投入時のみ。06-drill-mode.md 決定 1）
 * - 結果画面表示中に削除された単語は存在確認フィルタで skip する（決定 3 と同形）
 */
export async function createDrillForUser(
  userId: string,
  input: {
    occurrenceId: string;
    format: QuizFormat;
    timeoutSeconds: number | null;
    choiceFirstMeaningTextOnly: boolean;
    /** false（既定）= 誤答のみ Drill に入れる。true で正答単語も入れる（従来挙動）。 */
    drillIncludeCorrect: boolean;
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
    const existingResults = input.results.filter((r) => existingIds.has(r.wordId));
    // 既定（drillIncludeCorrect=false）は誤答・うろ覚えのみ Drill に投入する。正答単語のみ
    // トグル依存で、OFF のときは DrillWord を作らず除外する（うろ覚えは常に投入）。
    const results = input.drillIncludeCorrect
      ? existingResults
      : existingResults.filter((r) => r.result !== "CORRECT");

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
              remaining: initialRemainingFor(r.result),
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
