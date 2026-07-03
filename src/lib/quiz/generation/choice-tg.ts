// TG四択（CHOICE_TG / 英語→日本語）の問題生成。
// 問題文は target の TG 例文の英文、選択肢は各単語の TG 例文の意味。
// 出題対象は使える TG 例文（意味つき）を持つ単語のみ（1 単語 1 問・sortOrder 最小の 1 件）。

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
import type { ChoiceTgQuestion } from "@/lib/quiz/payload";

/** ダミーの基本数（正解 1 ＋ダミー 3 ＝四択）。不足時は縮退（最低 2 択＝ダミー 1 件）。 */
const CHOICE_DUMMY_COUNT = 3;

/** 出題対象に使える TG 例文の単語が 1 件もないときの理由（生成・成立判定で共用）。 */
export const NO_TG_TARGET_REASON = "TG例文（意味つき）が登録された出題対象の単語がありません";

/** TG四択（英→日）のダミー候補（1 候補 = 1 単語）。重複排除・表示は TG 例文の意味で行う。 */
function toTgMeaningCandidate(word: QuizWord): DummyCandidate<QuizWord>[] {
  return word.tgExample === null ? [] : [{ value: word, texts: [word.tgExample.meaning] }];
}

export function buildChoiceTgQuestions(material: QuizSourceMaterial, rng: Rng): ChoiceTgQuestion[] {
  const usableTargets = tgTargetsOf(material);
  // drill ラウンド再生成は checkFormatAvailability を通らないため、生成器自身も 0 件を検出する
  // （TG 例文の削除で全対象が使えなくなったケース。カウントダウン画面のエラー表示に乗る）。
  if (usableTargets.length === 0) {
    throw new QuizGenerationError(NO_TG_TARGET_REASON);
  }
  const orderedTargets = fisherYatesShuffle(usableTargets, rng);
  return orderedTargets.map((target) => {
    const primaryPool = [...material.targets, ...material.sameOccurrencePool]
      .filter((w) => w.id !== target.id)
      .flatMap(toTgMeaningCandidate);
    const fallbackPool = material.allWordsPool.flatMap(toTgMeaningCandidate);
    const dummies = selectDummies({
      correctTexts: [target.tgExample.meaning],
      primaryPool,
      fallbackPool,
      desiredCount: CHOICE_DUMMY_COUNT,
      rng,
    });
    const shuffled = fisherYatesShuffle(
      [
        { text: target.tgExample.meaning, isCorrect: true },
        // ダミーは toTgMeaningCandidate で TG 例文つきの単語に絞り込み済み
        ...dummies.filter(hasTgExample).map((w) => ({
          text: w.tgExample.meaning,
          isCorrect: false,
        })),
      ],
      rng,
    );
    return {
      ...questionBaseOf(target),
      prompt: target.tgExample.text,
      choices: shuffled.map((c) => ({ text: c.text })),
      correctIndex: shuffled.findIndex((c) => c.isCorrect),
    };
  });
}
