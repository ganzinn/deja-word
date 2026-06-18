// 四択（CHOICE）の問題生成。

import { selectDummies, type DummyCandidate } from "@/lib/quiz/generation/dummy-pool";
import {
  allMeaningTexts,
  firstMeaningText,
  questionBaseOf,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { ChoiceQuestion } from "@/lib/quiz/payload";

/** ダミーの基本数（正解 1 ＋ダミー 3 ＝四択）。不足時は縮退（最低 2 択＝ダミー 1 件）。 */
const CHOICE_DUMMY_COUNT = 3;

/** 四択の選択肢表示: 最初の Meaning（sortOrder 先頭）の MeaningText を「; 」で連結。 */
export function choiceDisplayText(word: QuizWord): string {
  return firstMeaningText(word);
}

/** 四択のダミー候補（1 候補 = 1 単語）。重複排除は表示対象（最初の Meaning）のテキストで行う。 */
function toWordCandidate(word: QuizWord): DummyCandidate<QuizWord> {
  return { value: word, texts: word.meanings[0]?.texts ?? [] };
}

export function buildChoiceQuestions(material: QuizSourceMaterial, rng: Rng): ChoiceQuestion[] {
  const orderedTargets = fisherYatesShuffle(material.targets, rng);
  return orderedTargets.map((target) => {
    const primaryPool = [...material.targets, ...material.sameOccurrencePool]
      .filter((w) => w.id !== target.id)
      .map(toWordCandidate);
    const fallbackPool = material.allWordsPool.map(toWordCandidate);
    const dummies = selectDummies({
      correctTexts: allMeaningTexts(target),
      primaryPool,
      fallbackPool,
      desiredCount: CHOICE_DUMMY_COUNT,
      rng,
    });
    const shuffled = fisherYatesShuffle(
      [
        { text: choiceDisplayText(target), isCorrect: true },
        ...dummies.map((w) => ({ text: choiceDisplayText(w), isCorrect: false })),
      ],
      rng,
    );
    return {
      ...questionBaseOf(target),
      choices: shuffled.map((c) => ({ text: c.text })),
      correctIndex: shuffled.findIndex((c) => c.isCorrect),
    };
  });
}
