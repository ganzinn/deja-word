import "server-only";

import { isTgExampleFormat } from "@/lib/quiz/format-options";
import {
  assertOccurrenceVisible,
  countQuizSourceExclusions,
  countQuizTargets,
} from "@/lib/quiz/queries/quiz-source";
import type { QuizFormat } from "@/generated/prisma/enums";

/** テスト範囲の入力。ownerId は常にセッション由来でクライアント入力に含めない。 */
export type QuizRangeInput = {
  occurrenceId: string;
  rangeFrom?: number;
  rangeTo?: number;
};

export type QuizPreview = {
  targetCount: number;
  /** noTgExample は TG 例文形式のときのみ数値（それ以外は null = カウントせず表示しない）。 */
  excluded: { noNumber: number; noMeaning: number; noTgExample: number | null };
};

/**
 * テスト開始前のプレビュー（対象件数・除外内訳）を返す。
 *
 * 掲載箇所選択ごとに走るため、全コーパスは読み込まず count クエリのみで件数を出す。
 * 形式ごとの成立可否（ダミー確保）は事前判定せず、テスト開始時に `generateQuizForUser` が
 * `checkFormatAvailability` で検証して `QuizGenerationError` を返す（不成立はそこで表示）。
 * ただし TG 例文形式（CHOICE_TG / CHOICE_TG_JA_EN）は出題対象そのものが「使える TG 例文を
 * 持つ単語」に絞られるため、`format` を渡された場合に限り対象件数・除外内訳を形式依存で数える
 * （05-architecture.md 決定 8 の追補）。
 *
 * 不在・不可視 Occurrence は `assertOccurrenceVisible` が OccurrenceNotFoundError を投げる
 * （count は不可視でも 0 を返すため、可視性は明示確認する）。
 */
export async function getQuizPreviewForUser(
  userId: string,
  input: QuizRangeInput & { format?: QuizFormat },
): Promise<QuizPreview> {
  await assertOccurrenceVisible(userId, input.occurrenceId);
  const range = { from: input.rangeFrom, to: input.rangeTo };
  const tgFormat = input.format !== undefined && isTgExampleFormat(input.format);
  const [targetCount, excluded] = await Promise.all([
    countQuizTargets(userId, input.occurrenceId, range, { requireTgExample: tgFormat }),
    countQuizSourceExclusions(userId, input.occurrenceId, { countTgExample: tgFormat }),
  ]);

  return { targetCount, excluded };
}
