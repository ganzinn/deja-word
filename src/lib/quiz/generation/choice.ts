// 四択（CHOICE）の問題生成。

import { selectDummies, type DummyCandidate } from "@/lib/quiz/generation/dummy-pool";
import {
  allMeaningTexts,
  firstMeaningHeadText,
  firstMeaningText,
  questionBaseOf,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { ChoiceQuestion } from "@/lib/quiz/payload";

/** ダミーの基本数（正解 1 ＋ダミー 3 ＝四択）。不足時は縮退（最低 2 択＝ダミー 1 件）。 */
const CHOICE_DUMMY_COUNT = 3;

/**
 * 四択の選択肢表示。最初の Meaning（sortOrder 先頭）の MeaningText を、
 * `firstMeaningTextOnly` が false なら「; 」で連結、true なら先頭の訳語のみ表示する。
 */
export function choiceDisplayText(word: QuizWord, firstMeaningTextOnly: boolean): string {
  return firstMeaningTextOnly ? firstMeaningHeadText(word) : firstMeaningText(word);
}

/**
 * 四択のダミー候補（1 候補 = 1 単語）。重複排除は表示対象（最初の Meaning）のテキストで行う。
 * `firstMeaningTextOnly` が true のときは表示が先頭訳語のみになるため、重複排除キーも先頭訳語に
 * 縮める（縮めないと別単語でも先頭訳語が同じだと見た目重複の選択肢になる）。
 */
function toWordCandidate(word: QuizWord, firstMeaningTextOnly: boolean): DummyCandidate<QuizWord> {
  const texts = word.meanings[0]?.texts ?? [];
  return { value: word, texts: firstMeaningTextOnly ? texts.slice(0, 1) : texts };
}

export function buildChoiceQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
  firstMeaningTextOnly: boolean,
): ChoiceQuestion[] {
  const orderedTargets = fisherYatesShuffle(material.targets, rng);
  return orderedTargets.map((target) => {
    const primaryPool = [...material.targets, ...material.sameOccurrencePool]
      .filter((w) => w.id !== target.id)
      .map((w) => toWordCandidate(w, firstMeaningTextOnly));
    const fallbackPool = material.allWordsPool.map((w) => toWordCandidate(w, firstMeaningTextOnly));
    const dummies = selectDummies({
      correctTexts: allMeaningTexts(target),
      primaryPool,
      fallbackPool,
      desiredCount: CHOICE_DUMMY_COUNT,
      rng,
    });
    const shuffled = fisherYatesShuffle(
      [
        { text: choiceDisplayText(target, firstMeaningTextOnly), isCorrect: true },
        ...dummies.map((w) => ({
          text: choiceDisplayText(w, firstMeaningTextOnly),
          isCorrect: false,
        })),
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
