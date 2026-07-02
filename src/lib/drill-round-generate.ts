import "server-only";

import { prisma } from "@/lib/prisma";
import { buildQuiz } from "@/lib/quiz/generation/build-quiz";
import { partitionMaterial, retargetMaterial } from "@/lib/quiz/generation/material";
import { DrillNotFoundError } from "@/lib/quiz/handlers/drill-round-handler";
import type { QuizPayload } from "@/lib/quiz/payload";
import { fetchQuizSource } from "@/lib/quiz/queries/quiz-source";
import type { StartQuizInput } from "@/lib/schema/quiz";

/**
 * drill ラウンド 1 回分の問題を再生成する（初回・再開とも単一経路。06-drill-mode.md 決定 6）。
 *
 * - 出題形式は `Drill.format` から導出（同 決定 4）
 * - 出題順・選択肢は毎回サーバー再生成（シード永続化なし。同 決定 5）
 * - 出題対象は未定着（remaining > 0）の DrillWord の単語**全て**（同 決定 1）。
 *   範囲ベースの partition 結果を未定着 id で再分割し、定着済みを含む範囲内の
 *   他単語は同一 Occurrence プール（ダミー候補）側に回す
 * - 現在の `roundCount` を返し、クライアントはラウンド送信の `expectedRoundCount` に使う
 *   （05-architecture.md 決定 4）
 * - `sourceTest`（元テストの開始入力）と `occurrenceName` を返し、完了画面の
 *   「同じ範囲でもう一度テストする」とその範囲表示に使う（06-drill-mode.md 決定 11。
 *   再開経路では `startInput` がクライアントに無いためサーバーから供給する）
 */
export async function generateDrillRoundForUser(
  userId: string,
  input: { drillId: string },
): Promise<{
  quiz: QuizPayload;
  roundCount: number;
  sourceTest: StartQuizInput;
  occurrenceName: string;
}> {
  const drill = await prisma.drill.findFirst({
    where: { id: input.drillId, ownerId: userId },
    select: {
      occurrenceId: true,
      occurrence: { select: { location: true } },
      format: true,
      timeoutSeconds: true,
      choiceFirstMeaningTextOnly: true,
      rangeFrom: true,
      rangeTo: true,
      sourceRangeFrom: true,
      sourceRangeTo: true,
      roundCount: true,
      words: { where: { remaining: { gt: 0 } }, select: { wordId: true } },
    },
  });
  if (!drill) throw new DrillNotFoundError();

  const { targetRows, sameOccurrenceRows, fallbackRows } = await fetchQuizSource(
    userId,
    drill.occurrenceId,
    { from: drill.rangeFrom, to: drill.rangeTo },
  );
  const partitioned = partitionMaterial(targetRows, sameOccurrenceRows, fallbackRows);
  const material = retargetMaterial(partitioned, new Set(drill.words.map((w) => w.wordId)));

  return {
    quiz: {
      ...buildQuiz(drill.format, material, Math.random, {
        choiceFirstMeaningTextOnly: drill.choiceFirstMeaningTextOnly,
      }),
      timeoutSeconds: drill.timeoutSeconds,
    },
    roundCount: drill.roundCount,
    sourceTest: {
      occurrenceId: drill.occurrenceId,
      // NULL = 元テストが範囲指定なし（Occurrence 全体）。StartQuizInput の optional に合わせる
      rangeFrom: drill.sourceRangeFrom ?? undefined,
      rangeTo: drill.sourceRangeTo ?? undefined,
      format: drill.format,
      timeoutSeconds: drill.timeoutSeconds,
      choiceFirstMeaningTextOnly: drill.choiceFirstMeaningTextOnly,
    },
    occurrenceName: drill.occurrence.location,
  };
}
