// 多義語選択（MULTI_MEANING）の問題生成。

import { selectDummies, type DummyCandidate } from "@/lib/quiz/generation/dummy-pool";
import {
  allMeaningTexts,
  questionBaseOf,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { fisherYatesShuffle, type Rng } from "@/lib/quiz/generation/shuffle";
import type { MultiMeaningQuestion } from "@/lib/quiz/payload";

const MIN_DUMMY_COUNT = 2;
const MAX_DUMMY_COUNT = 5;

/** 多義語選択のダミー候補（1 候補 = 1 MeaningText。同一単語から複数可）。 */
function toTextCandidates(word: QuizWord): DummyCandidate<string>[] {
  return allMeaningTexts(word).map((text) => ({ value: text.trim(), texts: [text] }));
}

/** 正解選択肢: 最初の Meaning（sortOrder 先頭）の MeaningText のみ。trim 後に同じテキストは 1 選択肢に統合。 */
function correctTextsOf(word: QuizWord): string[] {
  return [...new Set((word.meanings[0]?.texts ?? []).map((t) => t.trim()))];
}

export function buildMultiMeaningQuestions(
  material: QuizSourceMaterial,
  rng: Rng,
): MultiMeaningQuestion[] {
  const orderedTargets = fisherYatesShuffle(material.targets, rng);
  return orderedTargets.map((target) => {
    const correctTexts = correctTextsOf(target);
    // ダミー数は 2〜5 のランダム。プール不足時はある分まで縮退（最低 1。0 件はエラー）
    const dummyCount =
      MIN_DUMMY_COUNT + Math.floor(rng() * (MAX_DUMMY_COUNT - MIN_DUMMY_COUNT + 1));
    const primaryPool = [...material.targets, ...material.sameOccurrencePool]
      .filter((w) => w.id !== target.id)
      .flatMap(toTextCandidates);
    const fallbackPool = material.allWordsPool.flatMap(toTextCandidates);
    const dummies = selectDummies({
      // 正解表示は最初の Meaning のみだが、ダミー除外は target の全 Meaning で行う
      // （別品詞の実意味を誤答ダミーとして表示しないため。四択 choice.ts と同じ方針）。
      correctTexts: allMeaningTexts(target),
      primaryPool,
      fallbackPool,
      desiredCount: dummyCount,
      rng,
    });
    const options = fisherYatesShuffle(
      [
        ...correctTexts.map((text) => ({ text, isCorrect: true })),
        ...dummies.map((text) => ({ text, isCorrect: false })),
      ],
      rng,
    );
    return { ...questionBaseOf(target, "MULTI_MEANING"), options };
  });
}
