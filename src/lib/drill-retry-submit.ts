import "server-only";

import { prisma } from "@/lib/prisma";
import { DrillNotFoundError } from "@/lib/quiz/handlers/drill-round-handler";
import { insertQuizAnswers, type AnswerInput } from "@/lib/quiz/handlers/quiz-answer-handler";

/**
 * 「同じ問題で再テスト」（drill retry）の解答履歴を一括保存する薄い UseCase
 * （06-drill-mode.md 決定 10）。
 *
 * - mode（DRILL_RETRY）はサーバーが経路で決め、format は `Drill.format` から導出する
 *   （ラウンド送信と同じ。クライアント申告を受けない）
 * - 残数（DrillWord.remaining）・roundCount・completedAt には一切触れない。
 *   CAS もなし（冪等化は TEST と同じクライアント single-flight のみ。再送重複は MVP 許容）
 * - 削除済み単語は handler 側でスキップされ `skippedWordIds` として返る
 */
export async function submitDrillRetryForUser(
  userId: string,
  input: { drillId: string; answers: AnswerInput[] },
): Promise<{ savedCount: number; skippedWordIds: string[] }> {
  return prisma.$transaction(async (tx) => {
    const drill = await tx.drill.findFirst({
      where: { id: input.drillId, ownerId: userId },
      select: { format: true },
    });
    if (!drill) throw new DrillNotFoundError();

    return insertQuizAnswers(tx, userId, {
      mode: "DRILL_RETRY",
      format: drill.format,
      answers: input.answers,
    });
  });
}
