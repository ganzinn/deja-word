import "server-only";

import type { QuizFormat } from "@/generated/prisma/enums";
import { isTgExampleFormat } from "@/lib/quiz/format-options";
import { buildQuiz, checkFormatAvailability } from "@/lib/quiz/generation/build-quiz";
import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import { partitionMaterial } from "@/lib/quiz/generation/material";
import { fetchQuizSource } from "@/lib/quiz/queries/quiz-source";
import type { QuizPayload } from "@/lib/quiz/payload";
import type { QuizRangeInput } from "@/lib/quiz-preview";

/**
 * テスト開始: 選択肢構成・シャッフルまで済んだ完成品の問題データ一式を生成して返す。
 *
 * 問題生成は範囲内の出題対象を全件＋ダミー候補プールを目標件数まで優先順で不足分だけ読む独自経路
 * （`fetchQuizSource`）。プレビュー（`getQuizPreviewForUser`）は件数のみの軽量経路に分離された
 * ため（05-architecture.md 決定 8 改訂）、形式の成立可否はここで `checkFormatAvailability` に
 * より初めて判定する。
 * 不成立の場合は QuizGenerationError（カウントダウン画面でメッセージ表示）。
 *
 * Occurrence の可視性確認（不在は OccurrenceNotFoundError）は `fetchQuizSource` 冒頭で行われる。
 */
export async function generateQuizForUser(
  userId: string,
  input: QuizRangeInput & {
    format: QuizFormat;
    timeoutSeconds: number | null;
    choiceFirstMeaningTextOnly: boolean;
  },
): Promise<QuizPayload> {
  const { targetRows, sameOccurrenceRows, fallbackRows, tgExampleRows } = await fetchQuizSource(
    userId,
    input.occurrenceId,
    { from: input.rangeFrom, to: input.rangeTo },
    { includeTgExamples: isTgExampleFormat(input.format) },
  );
  const material = partitionMaterial(targetRows, sameOccurrenceRows, fallbackRows, tgExampleRows);

  const buildOptions = { choiceFirstMeaningTextOnly: input.choiceFirstMeaningTextOnly };
  const availability = checkFormatAvailability(input.format, material, buildOptions);
  if (!availability.available) {
    throw new QuizGenerationError(availability.reason);
  }

  return {
    ...buildQuiz(input.format, material, Math.random, buildOptions),
    timeoutSeconds: input.timeoutSeconds,
  };
}
