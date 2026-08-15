import type { QuizPayload } from "@/lib/quiz/payload";

/** 結果一覧の正解列の表示データ。強調ありは自己判定（英→日）のみ。 */
export type CorrectDisplay = {
  /** 表示要素。強調なしの形式は常に 1 要素。 */
  texts: string[];
  /** 先頭要素を赤字で強調するか。 */
  emphasizeFirst: boolean;
};

/**
 * 結果一覧の「正解」表示データを payload から導出する（形式網羅 switch。形式追加時の更新漏れを型で検出する）。
 * 自己判定（英語→日本語）だけは最初の Meaning の訳語を連結せず配列のまま返し、描画側で先頭を赤字にする
 * （連結すると先頭の訳語を切り出せないため）。区切りの「; 」は描画側が要素の間に置く。
 */
export function correctAnswerDisplay(quiz: QuizPayload, index: number): CorrectDisplay {
  switch (quiz.format) {
    case "CHOICE":
    case "CHOICE_JA_EN":
    case "CHOICE_TG":
    case "CHOICE_TG_JA_EN": {
      // 四択系の正解は正解選択肢のテキスト（訳語 / 英単語 / TG 例文の意味 / TG 例文の英文）
      const question = quiz.questions[index];
      return {
        texts: [question.choices[question.correctIndex]?.text ?? ""],
        emphasizeFirst: false,
      };
    }
    case "SELF_JUDGE": {
      // 最初の Meaning の MeaningText をそのまま配列で渡す（先頭を強調するため連結しない）
      const question = quiz.questions[index];
      return { texts: question.answer[0]?.texts ?? [], emphasizeFirst: true };
    }
    case "MULTI_MEANING": {
      // 正解集合（payload の正解選択肢）を「; 」連結
      const question = quiz.questions[index];
      return {
        texts: [
          question.options
            .filter((option) => option.isCorrect)
            .map((option) => option.text)
            .join("; "),
        ],
        emphasizeFirst: false,
      };
    }
    case "SELF_JUDGE_JA_EN":
    case "SPELLING":
      // 日本語→英語の正解は英単語（headword）
      return { texts: [quiz.questions[index].headword], emphasizeFirst: false };
    case "SELF_JUDGE_TG":
    case "SELF_JUDGE_TG_JA_EN":
      // TG自己判定の正解は解答表示と同じ（TG 例文の意味 / 英文）
      return { texts: [quiz.questions[index].answer], emphasizeFirst: false };
  }
}
