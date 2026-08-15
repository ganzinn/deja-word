import { describe, expect, test } from "vitest";

import type { QuizPayload } from "@/lib/quiz/payload";

import { correctAnswerDisplay } from "./correct-answer-display";

// payload → 表示データの導出だけを検証するため、入力は形式ごとに手書きする（buildQuiz を通さない）。
// QuizPayload は discriminated union なので、形式ごとに必要フィールドだけ埋めた最小オブジェクトでよい。
const base = {
  wordId: "w_1",
  headword: "abandon",
  pronunciationAudioUrl: null,
  ttsText: "abandon",
};

describe("correctAnswerDisplay", () => {
  test.each([
    ["CHOICE_JA_EN", "abandon"],
    ["CHOICE_TG", "彼は計画を見捨てた。"],
    ["CHOICE_TG_JA_EN", "He abandoned the plan."],
  ] as const)(
    "正解が訳語でない四択 %s は正解選択肢のテキスト 1 要素・強調なし",
    (format, correctText) => {
      const quiz = {
        format,
        timeoutSeconds: null,
        questions: [
          {
            ...base,
            prompt: "問題文",
            choices: [{ text: "ダミー" }, { text: correctText }, { text: "ダミー2" }],
            correctIndex: 1,
          },
        ],
      } as QuizPayload;
      expect(correctAnswerDisplay(quiz, 0)).toEqual({
        texts: [correctText],
        emphasizeFirst: false,
      });
    },
  );

  test("CHOICE は選択肢ではなく correctMeaningTexts を配列で返し、強調あり", () => {
    const quiz: QuizPayload = {
      format: "CHOICE",
      timeoutSeconds: null,
      questions: [
        {
          ...base,
          // 「先頭の訳語のみ表示」設定 ON で選択肢が 1 つに絞られていても、正解列は全訳語を出す
          choices: [{ text: "ダミー" }, { text: "見捨てる" }, { text: "ダミー2" }],
          correctIndex: 1,
          correctMeaningTexts: ["見捨てる", "断念する"],
        },
      ],
    };
    expect(correctAnswerDisplay(quiz, 0)).toEqual({
      texts: ["見捨てる", "断念する"],
      emphasizeFirst: true,
    });
  });

  test("SELF_JUDGE は最初の Meaning の訳語を連結せず配列で返し、強調あり", () => {
    const quiz: QuizPayload = {
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      questions: [
        {
          ...base,
          answer: [
            { partOfSpeech: "動", texts: ["見捨てる", "断念する"] },
            { partOfSpeech: "名", texts: ["奔放さ"] },
          ],
        },
      ],
    };
    expect(correctAnswerDisplay(quiz, 0)).toEqual({
      texts: ["見捨てる", "断念する"],
      emphasizeFirst: true,
    });
  });

  test("MULTI_MEANING はシャッフル済みの選択肢ではなく訳語順の correctMeaningTexts を返し、強調あり", () => {
    const quiz: QuizPayload = {
      format: "MULTI_MEANING",
      timeoutSeconds: null,
      questions: [
        {
          ...base,
          // options は選択肢としてシャッフル済み（正解の並びが訳語順とは限らない）
          options: [
            { text: "断念する", isCorrect: true },
            { text: "誤答の意味", isCorrect: false },
            { text: "見捨てる", isCorrect: true },
          ],
          correctMeaningTexts: ["見捨てる", "断念する"],
        },
      ],
    };
    expect(correctAnswerDisplay(quiz, 0)).toEqual({
      texts: ["見捨てる", "断念する"],
      emphasizeFirst: true,
    });
  });

  test.each(["SELF_JUDGE_JA_EN", "SPELLING"] as const)(
    "日→英の %s は headword 1 要素・強調なし",
    (format) => {
      const quiz = {
        format,
        timeoutSeconds: null,
        questions: [{ ...base, prompt: "見捨てる; 断念する" }],
      } as QuizPayload;
      expect(correctAnswerDisplay(quiz, 0)).toEqual({ texts: ["abandon"], emphasizeFirst: false });
    },
  );

  test.each([
    ["SELF_JUDGE_TG", "彼は計画を見捨てた。"],
    ["SELF_JUDGE_TG_JA_EN", "He abandoned the plan."],
  ] as const)("TG自己判定の %s は answer 1 要素・強調なし", (format, answer) => {
    const quiz = {
      format,
      timeoutSeconds: null,
      questions: [{ ...base, prompt: "問題文", answer }],
    } as QuizPayload;
    expect(correctAnswerDisplay(quiz, 0)).toEqual({ texts: [answer], emphasizeFirst: false });
  });

  test("正解が訳語でない四択で正解選択肢が無くても例外を投げず空文字 1 要素になる", () => {
    const quiz: QuizPayload = {
      format: "CHOICE_JA_EN",
      timeoutSeconds: null,
      questions: [{ ...base, prompt: "見捨てる", choices: [{ text: "abandon" }], correctIndex: 3 }],
    };
    expect(correctAnswerDisplay(quiz, 0)).toEqual({ texts: [""], emphasizeFirst: false });
  });

  // 意味未登録の単語（TG 形式の出題対象）が定着モードで混ざる等の経路に備えた防御的な確認
  test.each([
    [
      "SELF_JUDGE",
      { format: "SELF_JUDGE", timeoutSeconds: null, questions: [{ ...base, answer: [] }] },
    ],
    [
      "CHOICE",
      {
        format: "CHOICE",
        timeoutSeconds: null,
        questions: [{ ...base, choices: [], correctIndex: 0, correctMeaningTexts: [] }],
      },
    ],
    [
      "MULTI_MEANING",
      {
        format: "MULTI_MEANING",
        timeoutSeconds: null,
        questions: [{ ...base, options: [], correctMeaningTexts: [] }],
      },
    ],
  ] as [string, QuizPayload][])(
    "%s は訳語が空でも例外を投げず空配列になる（強調ありは維持）",
    (_format, quiz) => {
      expect(correctAnswerDisplay(quiz, 0)).toEqual({ texts: [], emphasizeFirst: true });
    },
  );
});
