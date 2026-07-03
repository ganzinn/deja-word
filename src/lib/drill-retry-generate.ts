import "server-only";

import { prisma } from "@/lib/prisma";
import { isTgExampleFormat } from "@/lib/quiz/format-options";
import { buildQuiz } from "@/lib/quiz/generation/build-quiz";
import { partitionMaterial, retargetMaterial } from "@/lib/quiz/generation/material";
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
 * 「同じ問題で再テスト」（drill retry）1 回分の問題を生成する（06-drill-mode.md 決定 10）。
 *
 * - 出題対象は wordIds（直前ラウンドの出題単語）のクライアント申告。ラウンド送信後は残数が
 *   更新済みでラウンドのメンバーシップは永続化していないため、サーバーでは導出できない
 *   （`startDrill` の results と同じ信頼モデル）。当該 drill の DrillWord との交差で検証し、
 *   drill 外の wordId は無視する
 * - remaining は見ない（そのラウンドで卒業した remaining=0 の単語も出題する）
 * - 形式・制限時間・四択の選択肢表示は `Drill` から導出（決定 4 と同じ）
 * - 出題順・選択肢は毎回サーバー再生成（決定 5 と同じ）
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
      choiceFirstMeaningTextOnly: true,
      rangeFrom: true,
      rangeTo: true,
      words: { select: { wordId: true } },
    },
  });
  if (!drill) throw new DrillNotFoundError();

  const drillWordIds = new Set(drill.words.map((w) => w.wordId));
  const memberIds = new Set(input.wordIds.filter((id) => drillWordIds.has(id)));
  if (memberIds.size === 0) throw new EmptyDrillRetryError();

  const { targetRows, sameOccurrenceRows, fallbackRows, tgExampleRows } = await fetchQuizSource(
    userId,
    drill.occurrenceId,
    { from: drill.rangeFrom, to: drill.rangeTo },
    { includeTgExamples: isTgExampleFormat(drill.format) },
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
        choiceFirstMeaningTextOnly: drill.choiceFirstMeaningTextOnly,
      }),
      timeoutSeconds: drill.timeoutSeconds,
    },
  };
}
