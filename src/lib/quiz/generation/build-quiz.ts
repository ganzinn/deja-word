// 形式ディスパッチャと成立判定。両方 exhaustive switch（`never` チェック）。
// 形式追加時は (1) Prisma enum 値 (2) generation/<format>.ts (3) payload.ts union
// (4) question-<format>.tsx の 4 箇所＋本ファイルの switch を更新する。

import type { QuizFormat } from "@/generated/prisma/enums";
import { buildChoiceQuestions } from "@/lib/quiz/generation/choice";
import { hasValidDummyCandidate, type DummyCandidate } from "@/lib/quiz/generation/dummy-pool";
import {
  allMeaningTexts,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { buildMultiMeaningQuestions } from "@/lib/quiz/generation/multi-meaning";
import { buildSelfJudgeQuestions } from "@/lib/quiz/generation/self-judge";
import type { Rng } from "@/lib/quiz/generation/shuffle";
import type { QuizPayload } from "@/lib/quiz/payload";

function assertNever(value: never): never {
  throw new Error(`Unexpected quiz format: ${String(value)}`);
}

/** 選択肢構成・シャッフルまで済んだ完成品の問題データ一式を生成する。 */
export function buildQuiz(format: QuizFormat, material: QuizSourceMaterial, rng: Rng): QuizPayload {
  switch (format) {
    case "CHOICE":
      return { format: "CHOICE", questions: buildChoiceQuestions(material, rng) };
    case "SELF_JUDGE":
      return { format: "SELF_JUDGE", questions: buildSelfJudgeQuestions(material, rng) };
    case "MULTI_MEANING":
      return { format: "MULTI_MEANING", questions: buildMultiMeaningQuestions(material, rng) };
    default:
      return assertNever(format);
  }
}

/** 1 形式分の成立可否＋不成立理由。 */
export type FormatAvailability =
  | { available: true; reason: null }
  | { available: false; reason: string };

const AVAILABLE: FormatAvailability = { available: true, reason: null };

/** 候補抽出ルールに従い、全出題対象でダミーを 1 件以上確保できるか調べる。 */
function findDummylessTarget(
  material: QuizSourceMaterial,
  toCandidates: (word: QuizWord) => DummyCandidate<unknown>[],
): QuizWord | undefined {
  return material.targets.find((target) => {
    const candidates = [
      ...material.targets,
      ...material.sameOccurrencePool,
      ...material.allWordsPool,
    ]
      .filter((w) => w.id !== target.id)
      .flatMap(toCandidates);
    return !hasValidDummyCandidate(allMeaningTexts(target), candidates);
  });
}

/** 1 形式分の成立可否を返す。プレビューと問題生成が同じ判定を共有する。 */
export function checkFormatAvailability(
  format: QuizFormat,
  material: QuizSourceMaterial,
): FormatAvailability {
  if (material.targets.length === 0) {
    return { available: false, reason: "出題対象の単語がありません" };
  }
  switch (format) {
    case "CHOICE": {
      const dummyless = findDummylessTarget(material, (word) => [
        { value: word, texts: word.meanings[0]?.texts ?? [] },
      ]);
      return dummyless === undefined
        ? AVAILABLE
        : {
            available: false,
            reason: `ダミー選択肢を確保できない単語があります（${dummyless.headword}）`,
          };
    }
    case "MULTI_MEANING": {
      const dummyless = findDummylessTarget(material, (word) =>
        allMeaningTexts(word).map((text) => ({ value: text, texts: [text] })),
      );
      return dummyless === undefined
        ? AVAILABLE
        : {
            available: false,
            reason: `ダミー選択肢を確保できない単語があります（${dummyless.headword}）`,
          };
    }
    case "SELF_JUDGE":
      return AVAILABLE;
    default:
      return assertNever(format);
  }
}
