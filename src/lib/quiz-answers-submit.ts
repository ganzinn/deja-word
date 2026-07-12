import "server-only";

import type { QuizFormat } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { insertQuizAnswers, type AnswerInput } from "@/lib/quiz/handlers/quiz-answer-handler";

/**
 * 通常テストの解答履歴を一括保存する薄い UseCase。
 *
 * mode（TEST）はサーバーが経路で決め、クライアント入力に含めない
 * （docs/adr/0017-server-actions-over-route-handlers.md）。削除済み単語は handler 側でスキップされ
 * `skippedWordIds` として返る（docs/adr/0032-history-submit-single-flight.md）。
 */
export async function submitQuizAnswersForUser(
  userId: string,
  input: { format: QuizFormat; answers: AnswerInput[] },
): Promise<{ savedCount: number; skippedWordIds: string[] }> {
  return prisma.$transaction((tx) =>
    insertQuizAnswers(tx, userId, { mode: "TEST", format: input.format, answers: input.answers }),
  );
}
