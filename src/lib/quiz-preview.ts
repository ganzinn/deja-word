import "server-only";

import {
  assertOccurrenceVisible,
  countQuizSourceExclusions,
  countQuizTargets,
} from "@/lib/quiz/queries/quiz-source";

/** テスト範囲の入力。ownerId は常にセッション由来でクライアント入力に含めない。 */
export type QuizRangeInput = {
  occurrenceId: string;
  rangeFrom?: number;
  rangeTo?: number;
};

export type QuizPreview = {
  targetCount: number;
  excluded: { noNumber: number; noMeaning: number };
};

/**
 * テスト開始前のプレビュー（対象件数・除外内訳）を返す。
 *
 * 掲載箇所選択ごとに走るため、全コーパスは読み込まず count クエリのみで件数を出す。
 * 形式ごとの成立可否は事前判定せず、テスト開始時に `generateQuizForUser` が
 * `checkFormatAvailability` で検証して `QuizGenerationError` を返す（不成立はそこで表示）。
 *
 * 不在・不可視 Occurrence は `assertOccurrenceVisible` が OccurrenceNotFoundError を投げる
 * （count は不可視でも 0 を返すため、可視性は明示確認する）。
 */
export async function getQuizPreviewForUser(
  userId: string,
  input: QuizRangeInput,
): Promise<QuizPreview> {
  await assertOccurrenceVisible(userId, input.occurrenceId);
  const range = { from: input.rangeFrom, to: input.rangeTo };
  const [targetCount, excluded] = await Promise.all([
    countQuizTargets(userId, input.occurrenceId, range),
    countQuizSourceExclusions(userId, input.occurrenceId),
  ]);

  return { targetCount, excluded };
}
