import "server-only";

import type { QuizFormat, QuizMode, QuizResult } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/quiz/handlers/shared";
import { scopedOwnerIds } from "@/lib/system-user";

/** 1 解答分の入力。ownerId は常にセッション由来のためここには含めない。 */
export type AnswerInput = {
  wordId: string;
  result: QuizResult;
};

/**
 * 解答履歴を一括保存する。TEST と DRILL で共有する。
 *
 * 単語削除耐性（docs/adr/0032-history-submit-single-flight.md）: tx 内で可視単語の存在確認を行い、
 * 実在分のみ createMany する。FK 違反で全件失敗させず、存在しなかった単語は
 * `skippedWordIds` として返す。
 */
export async function insertQuizAnswers(
  tx: Tx,
  userId: string,
  input: { mode: QuizMode; format: QuizFormat; answers: AnswerInput[] },
): Promise<{ savedCount: number; skippedWordIds: string[] }> {
  const wordIds = input.answers.map((a) => a.wordId);
  const existing = await tx.word.findMany({
    where: { id: { in: wordIds }, ownerId: { in: scopedOwnerIds(userId) } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((w) => w.id));

  const saveable = input.answers.filter((a) => existingIds.has(a.wordId));
  let savedCount = 0;
  if (saveable.length > 0) {
    const created = await tx.quizAnswer.createMany({
      data: saveable.map((a) => ({
        ownerId: userId,
        wordId: a.wordId,
        mode: input.mode,
        format: input.format,
        result: a.result,
      })),
    });
    savedCount = created.count;
  }

  const skippedWordIds = wordIds.filter((id) => !existingIds.has(id));
  return { savedCount, skippedWordIds };
}
