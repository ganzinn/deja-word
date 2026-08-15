// スペル確認（SPELLING / 日本語→英語）の問題生成。
// 問題文は最初の Meaning（`firstMeaningTextOnly` が ON なら先頭の訳語 1 つ、OFF なら全訳語＋先頭を赤字）、
// 解答は headword（入力したスペルを headword と照合して自動採点）。

import {
  firstMeaningPrompt,
  questionBaseOf,
  type QuizSourceMaterial,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { SpellingQuestion } from "@/lib/quiz/payload";

export function buildSpellingQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
  firstMeaningTextOnly: boolean,
): SpellingQuestion[] {
  const orderedTargets = fisherYatesShuffle(material.targets, rng);
  return orderedTargets.map((target) => ({
    ...questionBaseOf(target, "SPELLING"),
    prompt: firstMeaningPrompt(target, firstMeaningTextOnly),
  }));
}
