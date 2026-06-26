import "server-only";

import type { QuizFormat, QuizResult } from "@/generated/prisma/enums";
import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";
import { type DrillRemainingConfig, initialRemaining } from "@/lib/quiz/generation/next-remaining";
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
 * - 初期残数は Drill の残数設定（誤答=resetRemaining / うろ覚え=vagueRemaining / 正答=
 *   initialCorrectRemaining。各 1..9。正答は投入時のみ。06-drill-mode.md 決定 1）。テスト開始時の
 *   設定値を `Drill` 行へ保存し、ラウンド遷移（nextRemaining）でも同じ値を使う
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
    /** 定着までの回数（残数設定）。テスト開始時に解決済みの具体値（各 1..9）。 */
    resetRemaining: number;
    vagueRemaining: number;
    initialCorrectRemaining: number;
    results: DrillResultInput[];
  },
): Promise<{ drillId: string }> {
  const remainingConfig: DrillRemainingConfig = {
    resetRemaining: input.resetRemaining,
    vagueRemaining: input.vagueRemaining,
    initialCorrectRemaining: input.initialCorrectRemaining,
  };
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
        resetRemaining: input.resetRemaining,
        vagueRemaining: input.vagueRemaining,
        initialCorrectRemaining: input.initialCorrectRemaining,
        words: {
          createMany: {
            data: results.map((r) => ({
              wordId: r.wordId,
              remaining: initialRemaining(r.result, remainingConfig),
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
