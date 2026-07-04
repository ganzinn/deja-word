// TG四択（CHOICE_TG_JA_EN / 日本語→英語）の問題生成。
// 問題文は target の TG 例文の意味、選択肢は各単語の TG 例文の英文。
// 出題対象は使える TG 例文（意味つき）を持つ単語のみ（1 単語 1 問・sortOrder 最小の 1 件）。

import { NO_TG_TARGET_REASON } from "@/lib/quiz/generation/choice-tg";
import {
  QuizGenerationError,
  selectDummies,
  type DummyCandidate,
} from "@/lib/quiz/generation/dummy-pool";
import {
  hasTgExample,
  questionBaseOf,
  tgTargetsOf,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { ChoiceTgJaEnQuestion } from "@/lib/quiz/payload";

/** ダミーの基本数（正解 1 ＋ダミー 3 ＝四択）。不足時は縮退（最低 2 択＝ダミー 1 件）。 */
const CHOICE_DUMMY_COUNT = 3;

/** TG四択（日→英）のダミー候補（1 候補 = 1 単語）。重複排除・表示は TG 例文の英文で行う。 */
function toTgTextCandidate(word: QuizWord): DummyCandidate<QuizWord>[] {
  return word.tgExample === null ? [] : [{ value: word, texts: [word.tgExample.text] }];
}

export function buildChoiceTgJaEnQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
): ChoiceTgJaEnQuestion[] {
  const usableTargets = tgTargetsOf(material);
  // drill ラウンド再生成は checkFormatAvailability を通らないため、生成器自身も 0 件を検出する
  // （choice-tg.ts と同じ縮退。カウントダウン画面のエラー表示に乗る）。
  if (usableTargets.length === 0) {
    throw new QuizGenerationError(NO_TG_TARGET_REASON);
  }
  const orderedTargets = fisherYatesShuffle(usableTargets, rng);
  return orderedTargets.map((target) => {
    const primaryPool = [...material.targets, ...material.sameOccurrencePool]
      .filter((w) => w.id !== target.id)
      .flatMap(toTgTextCandidate);
    const fallbackPool = material.allWordsPool.flatMap(toTgTextCandidate);
    const dummies = selectDummies({
      correctTexts: [target.tgExample.text],
      primaryPool,
      fallbackPool,
      desiredCount: CHOICE_DUMMY_COUNT,
      rng,
    });
    const shuffled = fisherYatesShuffle(
      [
        { text: target.tgExample.text, isCorrect: true },
        // ダミーは toTgTextCandidate で TG 例文つきの単語に絞り込み済み
        ...dummies.filter(hasTgExample).map((w) => ({
          text: w.tgExample.text,
          isCorrect: false,
        })),
      ],
      rng,
    );
    return {
      ...questionBaseOf(target),
      prompt: target.tgExample.meaning,
      choices: shuffled.map((c) => ({ text: c.text })),
      correctIndex: shuffled.findIndex((c) => c.isCorrect),
    };
  });
}
