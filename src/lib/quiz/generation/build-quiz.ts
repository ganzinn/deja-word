// 形式ディスパッチャと成立判定。両方 exhaustive switch（`never` チェック）。
// 形式追加時は (1) Prisma enum 値 (2) generation/<format>.ts (3) payload.ts union
// (4) question-<format>.tsx の 4 箇所＋本ファイルの switch を更新する。

import type { QuizFormat } from "@/generated/prisma/enums";
import { buildChoiceQuestions } from "@/lib/quiz/generation/choice";
import { buildChoiceJaEnQuestions } from "@/lib/quiz/generation/choice-ja-en";
import { hasValidDummyCandidate, type DummyCandidate } from "@/lib/quiz/generation/dummy-pool";
import {
  allMeaningTexts,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { buildMultiMeaningQuestions } from "@/lib/quiz/generation/multi-meaning";
import { buildSelfJudgeQuestions } from "@/lib/quiz/generation/self-judge";
import { buildSelfJudgeJaEnQuestions } from "@/lib/quiz/generation/self-judge-ja-en";
import { buildSpellingQuestions } from "@/lib/quiz/generation/spelling";
import type { Rng } from "@/lib/quiz/generation/shuffle";
import type { QuizQuestionsPayload } from "@/lib/quiz/payload";

function assertNever(value: never): never {
  throw new Error(`Unexpected quiz format: ${String(value)}`);
}

/** `buildQuiz` の形式別オプション。CHOICE の選択肢表示のみ参照する。 */
export type BuildQuizOptions = {
  /** 四択（英→日）の選択肢を先頭の訳語のみで表示する（false = 全訳語を「; 」連結）。 */
  choiceFirstMeaningTextOnly?: boolean;
};

/** 選択肢構成・シャッフルまで済んだ完成品の問題データ一式を生成する。 */
export function buildQuiz(
  format: QuizFormat,
  material: QuizSourceMaterial,
  rng: Rng,
  options: BuildQuizOptions = {},
): QuizQuestionsPayload {
  switch (format) {
    case "CHOICE":
      return {
        format: "CHOICE",
        questions: buildChoiceQuestions(material, rng, options.choiceFirstMeaningTextOnly ?? false),
      };
    case "SELF_JUDGE":
      return { format: "SELF_JUDGE", questions: buildSelfJudgeQuestions(material, rng) };
    case "MULTI_MEANING":
      return { format: "MULTI_MEANING", questions: buildMultiMeaningQuestions(material, rng) };
    case "CHOICE_JA_EN":
      return { format: "CHOICE_JA_EN", questions: buildChoiceJaEnQuestions(material, rng) };
    case "SELF_JUDGE_JA_EN":
      return { format: "SELF_JUDGE_JA_EN", questions: buildSelfJudgeJaEnQuestions(material, rng) };
    case "SPELLING":
      return { format: "SPELLING", questions: buildSpellingQuestions(material, rng) };
    default:
      return assertNever(format);
  }
}

/** 1 形式分の成立可否＋不成立理由。 */
export type FormatAvailability =
  | { available: true; reason: null }
  | { available: false; reason: string };

const AVAILABLE: FormatAvailability = { available: true, reason: null };

/**
 * 候補抽出ルールに従い、全出題対象でダミーを 1 件以上確保できるか調べる。
 * `correctTextsOf` は正解側テキスト（ダミーから除外する値）。既定は全 Meaning（英語→日本語）。
 */
function findDummylessTarget(
  material: QuizSourceMaterial,
  toCandidates: (word: QuizWord) => DummyCandidate<unknown>[],
  correctTextsOf: (word: QuizWord) => string[] = allMeaningTexts,
): QuizWord | undefined {
  return material.targets.find((target) => {
    const candidates = [
      ...material.targets,
      ...material.sameOccurrencePool,
      ...material.allWordsPool,
    ]
      .filter((w) => w.id !== target.id)
      .flatMap(toCandidates);
    return !hasValidDummyCandidate(correctTextsOf(target), candidates);
  });
}

/** 1 形式分の成立可否を返す。テスト開始時（`generateQuizForUser`）が選択形式について呼ぶ。 */
export function checkFormatAvailability(
  format: QuizFormat,
  material: QuizSourceMaterial,
  options: BuildQuizOptions = {},
): FormatAvailability {
  if (material.targets.length === 0) {
    return { available: false, reason: "出題対象の単語がありません" };
  }
  switch (format) {
    case "CHOICE": {
      // 選択肢表示と同じキーで成立判定する（先頭訳語のみ表示なら先頭訳語で重複排除）。
      const firstMeaningTextOnly = options.choiceFirstMeaningTextOnly ?? false;
      const dummyless = findDummylessTarget(material, (word) => {
        const texts = word.meanings[0]?.texts ?? [];
        return [{ value: word, texts: firstMeaningTextOnly ? texts.slice(0, 1) : texts }];
      });
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
    case "CHOICE_JA_EN": {
      // 日本語→英語の四択は選択肢が英単語。正解側は headword、ダミー候補も headword。
      const dummyless = findDummylessTarget(
        material,
        (word) => [{ value: word, texts: [word.headword] }],
        (word) => [word.headword],
      );
      return dummyless === undefined
        ? AVAILABLE
        : {
            available: false,
            reason: `ダミー選択肢を確保できない単語があります（${dummyless.headword}）`,
          };
    }
    case "SELF_JUDGE":
    case "SELF_JUDGE_JA_EN":
    case "SPELLING":
      return AVAILABLE;
    default:
      return assertNever(format);
  }
}
