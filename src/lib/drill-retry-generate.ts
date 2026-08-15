import "server-only";

import { prisma } from "@/lib/prisma";
import { isTgExampleFormat } from "@/lib/quiz/format-options";
import { buildQuiz } from "@/lib/quiz/generation/build-quiz";
import { partitionMaterial, retargetMaterial } from "@/lib/quiz/generation/material";
import { occurrenceNumbersOf } from "@/lib/quiz/generation/order";
import { DrillNotFoundError } from "@/lib/quiz/handlers/drill-round-handler";
import type { QuizPayload } from "@/lib/quiz/payload";
import { fetchQuizSource } from "@/lib/quiz/queries/quiz-source";

/**
 * 再テストの対象になる単語が 1 件もない場合のエラー（wordIds と DrillWord の交差が空）。
 * 通常 UI からは到達しない: 再テストは直前ラウンドの出題単語（DrillWord に実在）から始まるため。
 * サーバーで到達するのは改ざん入力・極端な削除レースのみ。
 */
export class EmptyDrillRetryError extends Error {
  constructor() {
    super("EMPTY_DRILL_RETRY");
    this.name = "EmptyDrillRetryError";
  }
}

/**
 * 「同じ問題で再テスト」（drill retry）1 回分の問題を生成する（docs/adr/0041-drill-retry.md）。
 *
 * - 出題対象は wordIds（直前ラウンドの出題単語）のクライアント申告。ラウンド送信後は残数が
 *   更新済みでラウンドのメンバーシップは永続化していないため、サーバーでは導出できない
 *   （`startDrill` の results と同じ信頼モデル）。当該 drill の DrillWord との交差で検証し、
 *   drill 外の wordId は無視する
 * - remaining は見ない（そのラウンドで定着した remaining=0 の単語も出題する）
 * - 対象単語は `ensureTargetWordIds` で範囲と独立に取得する（ラウンド生成と同じ救済。
 *   番号が範囲外へ移動したメンバーも再テストできる。issue #106）
 * - 形式・制限時間・四択の選択肢表示・掲載番号順は `Drill` から導出（docs/adr/0038-drill-inherits-format-timeout.md）
 * - 出題順・選択肢は毎回サーバー再生成（docs/adr/0039-drill-reshuffle-each-round.md）。
 *   掲載番号順の drill だけは再シャッフルせず毎回同じ昇順になる
 *   （docs/adr/0072-quiz-order-by-occurrence-number.md）
 * - roundCount は返さない（再テスト送信は残数に触れず CAS 不要のため）
 */
export async function generateDrillRetryForUser(
  userId: string,
  input: { drillId: string; wordIds: string[] },
): Promise<{ quiz: QuizPayload }> {
  const drill = await prisma.drill.findFirst({
    where: { id: input.drillId, ownerId: userId },
    select: {
      occurrenceId: true,
      format: true,
      timeoutSeconds: true,
      firstMeaningTextOnly: true,
      orderByOccurrenceNumber: true,
      rangeFrom: true,
      rangeTo: true,
      words: { select: { wordId: true } },
    },
  });
  if (!drill) throw new DrillNotFoundError();

  const drillWordIds = new Set(drill.words.map((w) => w.wordId));
  const memberIds = new Set(input.wordIds.filter((id) => drillWordIds.has(id)));
  if (memberIds.size === 0) throw new EmptyDrillRetryError();

  // 全件モード drill は occurrenceId / range とも null。対象は ensureTargetWordIds（DrillWord 集合）で
  // 範囲と独立に取得する（ブックマーク条件は再適用しない。決定 5）。
  const { targetRows, sameOccurrenceRows, fallbackRows, tgExampleRows } = await fetchQuizSource(
    userId,
    drill.occurrenceId,
    { from: drill.rangeFrom ?? undefined, to: drill.rangeTo ?? undefined },
    { includeTgExamples: isTgExampleFormat(drill.format), ensureTargetWordIds: [...memberIds] },
  );
  const partitioned = partitionMaterial(
    targetRows,
    sameOccurrenceRows,
    fallbackRows,
    tgExampleRows,
  );
  const material = retargetMaterial(partitioned, memberIds);

  return {
    quiz: {
      ...buildQuiz(drill.format, material, Math.random, {
        firstMeaningTextOnly: drill.firstMeaningTextOnly,
        // 掲載箇所なし drill は掲載番号を持たないため常にランダム（全件モードの扱いと一貫）。
        occurrenceNumberByWordId:
          drill.orderByOccurrenceNumber && drill.occurrenceId !== null
            ? occurrenceNumbersOf(targetRows)
            : undefined,
      }),
      timeoutSeconds: drill.timeoutSeconds,
    },
  };
}
