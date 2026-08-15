// 自己判定（SELF_JUDGE_JA_EN / 日本語→英語）の問題生成。
// 問題文は最初の Meaning（`firstMeaningTextOnly` が ON なら先頭の訳語 1 つ、OFF なら「; 」連結）、
// 解答（自己申告で照合する英単語）は headword。

import {
  firstMeaningDisplayText,
  questionBaseOf,
  type QuizSourceMaterial,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { SelfJudgeJaEnQuestion } from "@/lib/quiz/payload";

export function buildSelfJudgeJaEnQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
  firstMeaningTextOnly: boolean,
): SelfJudgeJaEnQuestion[] {
  const orderedTargets = fisherYatesShuffle(material.targets, rng);
  return orderedTargets.map((target) => ({
    ...questionBaseOf(target, "SELF_JUDGE_JA_EN"),
    prompt: firstMeaningDisplayText(target, firstMeaningTextOnly),
  }));
}
