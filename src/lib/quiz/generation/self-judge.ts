// 自己判定（SELF_JUDGE）の問題生成。解答表示は全 Meaning を見せる。

import {
  meaningDisplaysOf,
  questionBaseOf,
  type QuizSourceMaterial,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { SelfJudgeQuestion } from "@/lib/quiz/payload";

export function buildSelfJudgeQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
): SelfJudgeQuestion[] {
  const orderedTargets = fisherYatesShuffle(material.targets, rng);
  return orderedTargets.map((target) => ({
    ...questionBaseOf(target, "SELF_JUDGE"),
    answer: meaningDisplaysOf(target),
  }));
}
