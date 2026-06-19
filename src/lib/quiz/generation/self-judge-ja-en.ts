// 自己判定（SELF_JUDGE_JA_EN / 日本語→英語）の問題生成。
// 問題文は全 Meaning、解答（自己申告で照合する英単語）は headword。

import {
  firstMeaningText,
  questionBaseOf,
  type QuizSourceMaterial,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { SelfJudgeJaEnQuestion } from "@/lib/quiz/payload";

export function buildSelfJudgeJaEnQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
): SelfJudgeJaEnQuestion[] {
  const orderedTargets = fisherYatesShuffle(material.targets, rng);
  return orderedTargets.map((target) => ({
    ...questionBaseOf(target),
    prompt: firstMeaningText(target),
  }));
}
