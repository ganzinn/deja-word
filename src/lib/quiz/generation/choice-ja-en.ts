// 四択（CHOICE_JA_EN / 日本語→英語）の問題生成。
// 問題文は target の最初の Meaning（`firstMeaningTextOnly` が ON なら先頭の訳語 1 つ、
// OFF なら全訳語＋先頭を赤字）、選択肢は英単語（headword）。

import { selectDummies, type DummyCandidate } from "@/lib/quiz/generation/dummy-pool";
import {
  firstMeaningHeadText,
  firstMeaningPrompt,
  questionBaseOf,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { ChoiceJaEnQuestion } from "@/lib/quiz/payload";

/** ダミーの基本数（正解 1 ＋ダミー 3 ＝四択）。不足時は縮退（最低 2 択＝ダミー 1 件）。 */
const CHOICE_DUMMY_COUNT = 3;

/**
 * 四択（日→英）の正解側テキスト（ダミーから除外する値）。
 * 設定 ON のときは問題文が先頭の訳語 1 つになるため、先頭訳語も衝突対象に含める。
 * 空文字（訳語未登録）は載せない（空文字同士を衝突と判定しないため）。
 */
export function choiceJaEnCorrectTexts(word: QuizWord, firstMeaningTextOnly: boolean): string[] {
  const headText = firstMeaningTextOnly ? firstMeaningHeadText(word) : "";
  return headText === "" ? [word.headword] : [word.headword, headText];
}

/**
 * 四択（日→英）のダミー候補（1 候補 = 1 単語）。表示・重複排除は headword、正解一致判定は
 * 設定 ON のとき headword ＋先頭訳語。生成（buildChoiceJaEnQuestions）と
 * 成立判定（checkFormatAvailability）で共有する。
 */
export function choiceJaEnCandidate(
  word: QuizWord,
  firstMeaningTextOnly: boolean,
): DummyCandidate<QuizWord> {
  const headText = firstMeaningTextOnly ? firstMeaningHeadText(word) : "";
  return headText === ""
    ? { value: word, texts: [word.headword] }
    : { value: word, texts: [word.headword], matchTexts: [word.headword, headText] };
}

export function buildChoiceJaEnQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
  firstMeaningTextOnly: boolean,
): ChoiceJaEnQuestion[] {
  const orderedTargets = fisherYatesShuffle(material.targets, rng);
  return orderedTargets.map((target) => {
    const primaryPool = [...material.targets, ...material.sameOccurrencePool]
      .filter((w) => w.id !== target.id)
      .map((w) => choiceJaEnCandidate(w, firstMeaningTextOnly));
    const fallbackPool = material.allWordsPool.map((w) =>
      choiceJaEnCandidate(w, firstMeaningTextOnly),
    );
    const dummies = selectDummies({
      correctTexts: choiceJaEnCorrectTexts(target, firstMeaningTextOnly),
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
      ...questionBaseOf(target, "CHOICE_JA_EN"),
      prompt: firstMeaningPrompt(target, firstMeaningTextOnly),
      choices: shuffled.map((c) => ({ text: c.text })),
      correctIndex: shuffled.findIndex((c) => c.isCorrect),
    };
  });
}
