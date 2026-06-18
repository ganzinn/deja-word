// 四択（CHOICE_JA_EN / 日本語→英語）の問題生成。
// 問題文は target の全 Meaning、選択肢は英単語（headword）。

import { selectDummies, type DummyCandidate } from "@/lib/quiz/generation/dummy-pool";
import {
  firstMeaningText,
  questionBaseOf,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { ChoiceJaEnQuestion } from "@/lib/quiz/payload";

/** ダミーの基本数（正解 1 ＋ダミー 3 ＝四択）。不足時は縮退（最低 2 択＝ダミー 1 件）。 */
const CHOICE_DUMMY_COUNT = 3;

/** 四択（日→英）のダミー候補（1 候補 = 1 単語）。重複排除・表示は headword で行う。 */
function toHeadwordCandidate(word: QuizWord): DummyCandidate<QuizWord> {
  return { value: word, texts: [word.headword] };
}

export function buildChoiceJaEnQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
): ChoiceJaEnQuestion[] {
  const orderedTargets = fisherYatesShuffle(material.targets, rng);
  return orderedTargets.map((target) => {
    const primaryPool = [...material.targets, ...material.sameOccurrencePool]
      .filter((w) => w.id !== target.id)
      .map(toHeadwordCandidate);
    const fallbackPool = material.allWordsPool.map(toHeadwordCandidate);
    const dummies = selectDummies({
      correctTexts: [target.headword],
      primaryPool,
      fallbackPool,
      desiredCount: CHOICE_DUMMY_COUNT,
      rng,
    });
    const shuffled = fisherYatesShuffle(
      [
        { text: target.headword, isCorrect: true },
        ...dummies.map((w) => ({ text: w.headword, isCorrect: false })),
      ],
      rng,
    );
    return {
      ...questionBaseOf(target),
      prompt: firstMeaningText(target),
      choices: shuffled.map((c) => ({ text: c.text })),
      correctIndex: shuffled.findIndex((c) => c.isCorrect),
    };
  });
}
