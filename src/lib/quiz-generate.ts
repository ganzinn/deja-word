import "server-only";

import type { QuizFormat } from "@/generated/prisma/enums";
import { isTgExampleFormat } from "@/lib/quiz/format-options";
import { buildQuiz, checkFormatAvailability } from "@/lib/quiz/generation/build-quiz";
import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import { partitionMaterial, retargetMaterial } from "@/lib/quiz/generation/material";
import { occurrenceNumbersOf } from "@/lib/quiz/generation/order";
import { pickN } from "@/lib/quiz/generation/shuffle";
import { fetchQuizSource } from "@/lib/quiz/queries/quiz-source";
import type { QuizPayload } from "@/lib/quiz/payload";
import type { QuizRangeInput } from "@/lib/quiz-preview";

/**
 * テスト開始: 選択肢構成・シャッフルまで済んだ完成品の問題データ一式を生成して返す。
 *
 * 問題生成は範囲内の出題対象を全件＋ダミー候補プールを目標件数まで優先順で不足分だけ読む独自経路
 * （`fetchQuizSource`）。プレビュー（`getQuizPreviewForUser`）は件数のみの軽量経路に分離された
 * ため（docs/adr/0030-dummy-pool-bounded-fetch.md）、形式の成立可否はここで `checkFormatAvailability` に
 * より初めて判定する。
 * 不成立の場合は QuizGenerationError（カウントダウン画面でメッセージ表示）。
 *
 * Occurrence の可視性確認（不在は OccurrenceNotFoundError）は `fetchQuizSource` 冒頭で行われる。
 *
 * 出題順は既定でランダム。`orderByOccurrenceNumber` が true かつ掲載箇所を指定している場合のみ
 * 掲載番号の昇順にする（docs/adr/0072-quiz-order-by-occurrence-number.md）。
 *
 * `questionCount` 指定時は出題対象からランダムに N 語を抽選し、抽選外の範囲内単語は
 * ダミー候補側へ回す（docs/adr/0074-quiz-question-count-sampling.md）。対象数以上の指定は
 * 全問出題（min 挙動）。形式の成立可否は抽選後の対象で判定する。
 */
export async function generateQuizForUser(
  userId: string,
  input: QuizRangeInput & {
    questionCount?: number;
    format: QuizFormat;
    timeoutSeconds: number | null;
    firstMeaningTextOnly: boolean;
    orderByOccurrenceNumber: boolean;
  },
): Promise<QuizPayload> {
  const { targetRows, sameOccurrenceRows, fallbackRows, tgExampleRows } = await fetchQuizSource(
    userId,
    // 掲載箇所未指定（ブックマーク全件モード）は null で渡す。
    input.occurrenceId ?? null,
    { from: input.rangeFrom, to: input.rangeTo },
    {
      includeTgExamples: isTgExampleFormat(input.format),
      bookmarkedOnly: input.bookmarkedOnly ?? false,
    },
  );
  let material = partitionMaterial(targetRows, sameOccurrenceRows, fallbackRows, tgExampleRows);
  // 出題数指定時は対象からランダムに N 語を抽選する。掲載番号順の並べ替えは buildQuiz が
  // 生成後に行うため、抽選順は出題順に影響しない（抽選 = 出題対象集合の決定のみ）。
  if (input.questionCount !== undefined && input.questionCount < material.targets.length) {
    const sampledIds = new Set(
      pickN(material.targets, input.questionCount, Math.random).map((w) => w.id),
    );
    material = retargetMaterial(material, sampledIds);
  }

  // 掲載番号順は掲載箇所を指定したときだけ有効（全件モードは掲載番号を持たない。ADR-0072）。
  const buildOptions = {
    firstMeaningTextOnly: input.firstMeaningTextOnly,
    occurrenceNumberByWordId:
      input.orderByOccurrenceNumber && input.occurrenceId !== undefined
        ? occurrenceNumbersOf(targetRows)
        : undefined,
  };
  const availability = checkFormatAvailability(input.format, material, buildOptions);
  if (!availability.available) {
    throw new QuizGenerationError(availability.reason);
  }

  return {
    ...buildQuiz(input.format, material, Math.random, buildOptions),
    timeoutSeconds: input.timeoutSeconds,
  };
}
