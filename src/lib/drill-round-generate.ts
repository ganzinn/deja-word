import "server-only";

import { prisma } from "@/lib/prisma";
import { buildQuiz } from "@/lib/quiz/generation/build-quiz";
import {
  partitionMaterial,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { DrillNotFoundError } from "@/lib/quiz/handlers/drill-round-handler";
import type { QuizPayload } from "@/lib/quiz/payload";
import { fetchQuizSource } from "@/lib/quiz/queries/quiz-source";

/**
 * drill ラウンド 1 回分の問題を再生成する（初回・再開とも単一経路。06-drill-mode.md 決定 6）。
 *
 * - 出題形式は `Drill.format` から導出（同 決定 4）
 * - 出題順・選択肢は毎回サーバー再生成（シード永続化なし。同 決定 5）
 * - 出題対象は未卒業（remaining > 0）の DrillWord の単語**全て**（同 決定 1）。
 *   範囲ベースの partition 結果を未卒業 id で再分割し、卒業済みを含む範囲内の
 *   他単語は同一 Occurrence プール（ダミー候補）側に回す
 * - 現在の `roundCount` を返し、クライアントはラウンド送信の `expectedRoundCount` に使う
 *   （05-architecture.md 決定 4）
 */
export async function generateDrillRoundForUser(
  userId: string,
  input: { drillId: string },
): Promise<{ quiz: QuizPayload; roundCount: number }> {
  const drill = await prisma.drill.findFirst({
    where: { id: input.drillId, ownerId: userId },
    select: {
      occurrenceId: true,
      format: true,
      rangeFrom: true,
      rangeTo: true,
      roundCount: true,
      words: { where: { remaining: { gt: 0 } }, select: { wordId: true } },
    },
  });
  if (!drill) throw new DrillNotFoundError();

  const rows = await fetchQuizSource(userId, drill.occurrenceId);
  const partitioned = partitionMaterial(rows, { from: drill.rangeFrom, to: drill.rangeTo });

  const unGraduated = new Set(drill.words.map((w) => w.wordId));
  const isTarget = (w: QuizWord) => unGraduated.has(w.id);
  const material: QuizSourceMaterial = {
    targets: [
      ...partitioned.targets,
      ...partitioned.sameOccurrencePool,
      ...partitioned.allWordsPool,
    ].filter(isTarget),
    sameOccurrencePool: [...partitioned.targets, ...partitioned.sameOccurrencePool].filter(
      (w) => !isTarget(w),
    ),
    allWordsPool: partitioned.allWordsPool.filter((w) => !isTarget(w)),
  };

  return {
    quiz: buildQuiz(drill.format, material, Math.random),
    roundCount: drill.roundCount,
  };
}
