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
 * テスト結果画面の「定着モードへ」起点で drill を生成する（docs/adr/0037-drill-per-source-test.md）。
 *
 * - 入力の results はクライアント申告（サーバーに「今回のテスト」を特定する手段が
 *   ないため。改ざんはカンニング許容方針と整合。docs/adr/0025-server-side-generation-cheating-accepted.md）
 * - 既定（drillIncludeCorrect=false）は誤答とうろ覚えを投入する。true で正答単語も投入する
 *   （結果画面トグル「正解した問題も定着モードで出題する」由来）。うろ覚え（VAGUE）は
 *   トグルに関係なく常に投入する（正解後にうろ覚えへ降格した＝復習したい意思表示のため）
 * - rangeFrom / rangeTo は投入対象の単語の occurrenceNumber から実効範囲（min / max）を
 *   サーバーで計算して保存する（掲載箇所ありのときだけ。全件モードは occurrenceId / range とも null）
 * - occurrenceId 省略 / null はブックマーク全件モードの元テスト由来。掲載番号の概念がないため
 *   存在する結果単語をそのまま投入する（掲載番号なし・未紐付けも含む。issue #106 の番号縛りは掲載箇所ありのみ）
 * - 初期残数は Drill の残数設定（誤答=resetRemaining / うろ覚え=vagueRemaining / 正答=
 *   initialCorrectRemaining。各 1..9。正答は投入時のみ。docs/adr/0036-drill-remaining-count-model.md）。テスト開始時の
 *   設定値を `Drill` 行へ保存し、ラウンド遷移（nextRemaining）でも同じ値を使う
 * - 結果画面表示中に削除された単語は存在確認フィルタで skip する（docs/adr/0032-history-submit-single-flight.md）
 * - 番号付きリンクの無い単語（未リンク・番号なし）は DrillWord に投入しない
 *   （出題不能な行を作らない。issue #106）
 */
export async function createDrillForUser(
  userId: string,
  input: {
    /** 掲載箇所。省略 / null = ブックマーク全件モードの元テスト由来（occurrenceId / range を null で作る）。 */
    occurrenceId?: string | null;
    /** 元テストの範囲（undefined = 範囲指定なし）。完了画面の「同じ範囲でもう一度テストする」に使う。 */
    sourceRangeFrom?: number;
    sourceRangeTo?: number;
    /** 元テストの「ブックマークのみ」指定（省略時 false）。`Drill.sourceBookmarkedOnly` に保存し再テストで再評価する。 */
    sourceBookmarkedOnly?: boolean;
    /** 元テストの出題数指定（undefined = 指定なし）。再テストで同じ出題数の再抽選に使う。 */
    sourceQuestionCount?: number;
    format: QuizFormat;
    timeoutSeconds: number | null;
    choiceFirstMeaningTextOnly: boolean;
    /** 元テストの「掲載番号順に出題する」指定（省略時 false）。全ラウンド・再テストへ引き継ぐ（docs/adr/0072-quiz-order-by-occurrence-number.md）。 */
    orderByOccurrenceNumber?: boolean;
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
  const occurrenceId = input.occurrenceId ?? null;
  // 掲載箇所ありのときだけ可視性を検証する（全件モードは検証対象の掲載箇所がない）。
  if (occurrenceId !== null) {
    const occurrence = await prisma.occurrence.findFirst({
      where: { id: occurrenceId, ownerId: { in: allowed } },
      select: { id: true },
    });
    if (!occurrence) throw new OccurrenceNotFoundError();
  }

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

    // 掲載箇所あり: 番号付きリンクを持つ単語だけを投入し、実効範囲を番号の min/max で計算する。
    // 番号なし・未リンクの単語は出題対象になれず remaining > 0 のまま完了不能化するため除外する（issue #106）。
    // 全件モード（掲載箇所なし）: 掲載番号の概念がないため存在する結果単語をそのまま投入し、
    // 実効範囲は計算しない（rangeFrom / rangeTo は null。掲載番号なし・未紐付けの単語も出題対象。決定 3・4）。
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;
    let insertResults = results;
    if (occurrenceId !== null) {
      const links = await tx.wordOccurrence.findMany({
        where: {
          occurrenceId,
          wordId: { in: results.map((r) => r.wordId) },
          ownerId: { in: allowed },
          occurrenceNumber: { not: null },
        },
        select: { wordId: true, occurrenceNumber: true },
      });
      const numbers = links.map((l) => l.occurrenceNumber).filter((n): n is number => n !== null);
      if (numbers.length === 0) throw new EmptyDrillResultsError();
      const numberedWordIds = new Set(links.map((l) => l.wordId));
      rangeFrom = Math.min(...numbers);
      rangeTo = Math.max(...numbers);
      insertResults = results.filter((r) => numberedWordIds.has(r.wordId));
    } else if (results.length === 0) {
      // 全件モードで投入対象が 0 件（改ざん入力・削除レース）は既存の 0 件流儀に合わせて throw。
      throw new EmptyDrillResultsError();
    }

    const drill = await tx.drill.create({
      data: {
        ownerId: userId,
        occurrenceId,
        rangeFrom,
        rangeTo,
        sourceRangeFrom: input.sourceRangeFrom ?? null,
        sourceRangeTo: input.sourceRangeTo ?? null,
        sourceBookmarkedOnly: input.sourceBookmarkedOnly ?? false,
        sourceQuestionCount: input.sourceQuestionCount ?? null,
        format: input.format,
        timeoutSeconds: input.timeoutSeconds,
        choiceFirstMeaningTextOnly: input.choiceFirstMeaningTextOnly,
        orderByOccurrenceNumber: input.orderByOccurrenceNumber ?? false,
        resetRemaining: input.resetRemaining,
        vagueRemaining: input.vagueRemaining,
        initialCorrectRemaining: input.initialCorrectRemaining,
        words: {
          createMany: {
            data: insertResults.map((r) => ({
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
