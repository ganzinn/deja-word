import "server-only";

import { QuizFormat } from "@/generated/prisma/enums";
import { checkFormatAvailability } from "@/lib/quiz/generation/build-quiz";
import { partitionMaterial } from "@/lib/quiz/generation/material";
import { countQuizSourceExclusions, fetchQuizSource } from "@/lib/quiz/queries/quiz-source";

/** テスト範囲の入力。ownerId は常にセッション由来でクライアント入力に含めない。 */
export type QuizRangeInput = {
  occurrenceId: string;
  rangeFrom?: number;
  rangeTo?: number;
};

export type QuizPreview = {
  targetCount: number;
  excluded: { noNumber: number; noMeaning: number };
  formats: { format: QuizFormat; available: boolean; reason: string | null }[];
};

/**
 * テスト開始前のプレビュー（対象件数・除外内訳・形式ごとの成立可否）を返す。
 *
 * 問題生成（`generateQuizForUser`）と同じ `fetchQuizSource`＋`checkFormatAvailability`
 * を共有するため、「プレビューでは成立・生成でエラー」の乖離が（レース以外で）起きない
 * （05-architecture.md 決定 8）。
 *
 * Occurrence の可視性確認（不在は OccurrenceNotFoundError）は `fetchQuizSource` 冒頭で行われる。
 */
export async function getQuizPreviewForUser(
  userId: string,
  input: QuizRangeInput,
): Promise<QuizPreview> {
  const rows = await fetchQuizSource(userId, input.occurrenceId);
  const excluded = await countQuizSourceExclusions(userId, input.occurrenceId);
  const material = partitionMaterial(rows, { from: input.rangeFrom, to: input.rangeTo });

  const formats = Object.values(QuizFormat).map((format) => {
    const availability = checkFormatAvailability(format, material);
    return { format, available: availability.available, reason: availability.reason };
  });

  return {
    targetCount: material.targets.length,
    excluded,
    formats,
  };
}
