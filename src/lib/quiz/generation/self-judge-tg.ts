// TG自己判定（SELF_JUDGE_TG / 英語→日本語）の問題生成。
// 問題文は target の TG 例文の英文、解答表示はその意味。ダミー不要。
// 出題対象は使える TG 例文（意味つき）を持つ単語のみ（1 単語 1 問・sortOrder 最小の 1 件）。

import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import {
  NO_TG_TARGET_REASON,
  questionBaseOf,
  tgTargetsOf,
  type QuizSourceMaterial,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { SelfJudgeTgQuestion } from "@/lib/quiz/payload";

export function buildSelfJudgeTgQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
): SelfJudgeTgQuestion[] {
  const usableTargets = tgTargetsOf(material);
  // drill ラウンド再生成は checkFormatAvailability を通らないため、生成器自身も 0 件を検出する
  // （choice-tg.ts と同じ縮退。カウントダウン画面のエラー表示に乗る）。
  if (usableTargets.length === 0) {
    throw new QuizGenerationError(NO_TG_TARGET_REASON);
  }
  const orderedTargets = fisherYatesShuffle(usableTargets, rng);
  return orderedTargets.map((target) => ({
    ...questionBaseOf(target, "SELF_JUDGE_TG"),
    prompt: target.tgExample.text,
    answer: target.tgExample.meaning,
  }));
}
