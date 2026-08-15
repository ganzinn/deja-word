import { describe, expect, test } from "vitest";

import type { QuizPayload } from "@/lib/quiz/payload";

import { promptViewOf } from "./prompt-view";

// payload → 表示データの導出だけを検証するため、入力は形式ごとに手書きする（buildQuiz を通さない）。
// QuizPayload は discriminated union なので、形式ごとに必要フィールドだけ埋めた最小オブジェクトでよい。
const base = {
  wordId: "w_1",
  headword: "abandon",
  pronunciationAudioUrl: null,
  ttsText: "abandon",
};

describe("promptViewOf", () => {
  test.each(["CHOICE", "SELF_JUDGE", "MULTI_MEANING"] as const)(
    "英→日の %s は見出しが headword で問題文データを持たない",
    (format) => {
      const quiz = { format, timeoutSeconds: null, questions: [{ ...base }] } as QuizPayload;
      expect(promptViewOf(quiz, 0)).toEqual({ kind: "headword" });
    },
  );

  // 設定 OFF（全訳語を出す）＝先頭を赤字。生成時に決まった値をそのまま運ぶ
  test.each(["CHOICE_JA_EN", "SELF_JUDGE_JA_EN", "SPELLING"] as const)(
    "日→英の %s は最初の Meaning の訳語と強調の有無をそのまま渡す",
    (format) => {
      const quiz = {
        format,
        timeoutSeconds: null,
        questions: [{ ...base, prompt: { texts: ["見捨てる", "断念する"], emphasizeFirst: true } }],
      } as QuizPayload;
      expect(promptViewOf(quiz, 0)).toEqual({
        kind: "ja-plain",
        texts: ["見捨てる", "断念する"],
        emphasizeFirst: true,
      });
    },
  );

  // 設定 ON（先頭の訳語 1 つに絞る）＝赤字にしない
  test("日→英の問題文は設定 ON では強調なしで渡る", () => {
    const quiz = {
      format: "SPELLING",
      timeoutSeconds: null,
      questions: [{ ...base, prompt: { texts: ["見捨てる"], emphasizeFirst: false } }],
    } as QuizPayload;
    expect(promptViewOf(quiz, 0)).toEqual({
      kind: "ja-plain",
      texts: ["見捨てる"],
      emphasizeFirst: false,
    });
  });

  test.each(["CHOICE_TG", "SELF_JUDGE_TG"] as const)(
    "TG 形式（英→日）の %s は TG 例文の英文を出す",
    (format) => {
      const quiz = {
        format,
        timeoutSeconds: null,
        questions: [{ ...base, prompt: "He abandoned the plan." }],
      } as QuizPayload;
      expect(promptViewOf(quiz, 0)).toEqual({
        kind: "tg-text",
        text: "He abandoned the plan.",
      });
    },
  );

  test.each(["CHOICE_TG_JA_EN", "SELF_JUDGE_TG_JA_EN"] as const)(
    "TG 形式（日→英）の %s は TG 例文の意味を出す",
    (format) => {
      const quiz = {
        format,
        timeoutSeconds: null,
        questions: [{ ...base, prompt: "彼は計画を見捨てた。" }],
      } as QuizPayload;
      expect(promptViewOf(quiz, 0)).toEqual({
        kind: "tg-meaning",
        text: "彼は計画を見捨てた。",
      });
    },
  );
});
