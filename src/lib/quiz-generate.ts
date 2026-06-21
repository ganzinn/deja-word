import "server-only";

import type { QuizFormat } from "@/generated/prisma/enums";
import { buildQuiz, checkFormatAvailability } from "@/lib/quiz/generation/build-quiz";
import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import { partitionMaterial } from "@/lib/quiz/generation/material";
import { fetchQuizSource } from "@/lib/quiz/queries/quiz-source";
import type { QuizPayload } from "@/lib/quiz/payload";
import type { QuizRangeInput } from "@/lib/quiz-preview";

/**
 * テスト開始: 選択肢構成・シャッフルまで済んだ完成品の問題データ一式を生成して返す。
 *
 * 問題生成は全コーパスを読む独自経路（`fetchQuizSource`）。プレビュー
 * （`getQuizPreviewForUser`）は件数のみの軽量経路に分離されたため（05-architecture.md
 * 決定 8 改訂）、形式の成立可否はここで `checkFormatAvailability` により初めて判定する。
 * 不成立の場合は QuizGenerationError（カウントダウン画面でメッセージ表示）。
 *
 * Occurrence の可視性確認（不在は OccurrenceNotFoundError）は `fetchQuizSource` 冒頭で行われる。
 */
export async function generateQuizForUser(
  userId: string,
  input: QuizRangeInput & { format: QuizFormat; timeoutSeconds: number | null },
): Promise<QuizPayload> {
  const rows = await fetchQuizSource(userId, input.occurrenceId);
  const material = partitionMaterial(rows, { from: input.rangeFrom, to: input.rangeTo });

  const availability = checkFormatAvailability(input.format, material);
  if (!availability.available) {
    throw new QuizGenerationError(availability.reason);
  }

  return {
    ...buildQuiz(input.format, material, Math.random),
    timeoutSeconds: input.timeoutSeconds,
  };
}
