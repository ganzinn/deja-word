import "server-only";

import { isTgExampleFormat } from "@/lib/quiz/format-options";
import {
  assertOccurrenceVisible,
  countQuizSourceExclusions,
  countQuizTargets,
} from "@/lib/quiz/queries/quiz-source";
import type { QuizFormat } from "@/generated/prisma/enums";

/**
 * テスト範囲の入力。ownerId は常にセッション由来でクライアント入力に含めない。
 * action 呼び出し元が満たす「パース前」の入力型（`bookmarkedOnly` / `occurrenceId` は
 * zod 側の `.default(false)` / optional に対応させ、省略時 false・未指定を許す）。必須にすると
 * 09 まで bookmarkedOnly を送らない start-form / quiz-flow が型エラーになるため optional にする。
 */
export type QuizRangeInput = {
  /** 掲載箇所。未指定 = ブックマーク全件モード（bookmarkedOnly=true かつ範囲未指定のときだけ有効）。 */
  occurrenceId?: string;
  rangeFrom?: number;
  rangeTo?: number;
  /** 「ブックマークのみ」絞り込み。省略時 false 扱い。 */
  bookmarkedOnly?: boolean;
};

export type QuizPreview = {
  targetCount: number;
  /**
   * noMeaning と noTgExample は形式で排他（非 TG 形式は noMeaning のみ数値・noTgExample=null、
   * TG 例文形式は noTgExample のみ数値・noMeaning=null）。null 側はカウントせず表示もしない。
   * noNumber はブックマーク全件モード（掲載箇所なし）では掲載箇所の概念がないため null になる
   * （全件モードの配線は 04。本経路は掲載箇所ありのみで数値）。
   */
  excluded: { noNumber: number | null; noMeaning: number | null; noTgExample: number | null };
};

/**
 * テスト開始前のプレビュー（対象件数・除外内訳）を返す。
 *
 * 掲載箇所選択ごとに走るため、全コーパスは読み込まず count クエリのみで件数を出す。
 * 形式ごとの成立可否（ダミー確保）は事前判定せず、テスト開始時に `generateQuizForUser` が
 * `checkFormatAvailability` で検証して `QuizGenerationError` を返す（不成立はそこで表示）。
 * ただし TG 例文形式（CHOICE_TG / CHOICE_TG_JA_EN）は出題対象そのものが「使える TG 例文を
 * 持つ単語」に絞られるため、`format` を渡された場合に限り対象件数・除外内訳を形式依存で数える
 * （docs/adr/0030-dummy-pool-bounded-fetch.md の追補）。
 *
 * 不在・不可視 Occurrence は `assertOccurrenceVisible` が OccurrenceNotFoundError を投げる
 * （count は不可視でも 0 を返すため、可視性は明示確認する）。
 */
export async function getQuizPreviewForUser(
  userId: string,
  input: QuizRangeInput & { format?: QuizFormat },
): Promise<QuizPreview> {
  // 掲載箇所未指定（全件モード）では検証対象の掲載箇所がないため可視性検証をスキップする。
  const occurrenceId = input.occurrenceId ?? null;
  if (occurrenceId !== null) await assertOccurrenceVisible(userId, occurrenceId);
  const bookmarkedOnly = input.bookmarkedOnly ?? false;
  const range = { from: input.rangeFrom, to: input.rangeTo };
  const tgFormat = input.format !== undefined && isTgExampleFormat(input.format);
  const [targetCount, excluded] = await Promise.all([
    countQuizTargets(userId, occurrenceId, range, { requireTgExample: tgFormat, bookmarkedOnly }),
    countQuizSourceExclusions(userId, occurrenceId, { countTgExample: tgFormat, bookmarkedOnly }),
  ]);

  return { targetCount, excluded };
}
