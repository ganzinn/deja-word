import type { QuizPayload } from "@/lib/quiz/payload";

/** 結果一覧の正解列の表示データ。強調ありは正解が訳語になる英→日 3 形式。 */
export type CorrectDisplay = {
  /** 表示要素。強調なしの形式は常に 1 要素。 */
  texts: string[];
  /** 先頭要素を赤字で強調するか。 */
  emphasizeFirst: boolean;
};

/**
 * 結果一覧の「正解」表示データを payload から導出する（形式網羅 switch。形式追加時の更新漏れを型で検出する）。
 * 正解が訳語になる英→日 3 形式（四択・自己判定・多義語選択）は、最初の Meaning の訳語を連結せず
 * 配列のまま返し、描画側で先頭を赤字にする（連結すると先頭の訳語を切り出せないため）。
 * 区切りの「; 」は描画側が要素の間に置く。正解が英単語・TG 例文になる形式は 1 要素・強調なし。
 *
 * 四択・多義語選択は出題側の表示（選択肢）と別経路になる。選択肢は「先頭の訳語のみ表示」設定で
 * 絞られたりシャッフルされたりするが、正解列は設定に依らず全訳語を訳語順で出す（ADR-0102）。
 *
 * 強調ありの形式では装飾記法（ADR-0077）の解釈単位が「連結後の文字列全体」から「訳語 1 件ごと」に変わる。
 * 記法は訳語 1 件の中で閉じるのが本来の使い方なので、この違いは許容している。
 */
export function correctAnswerDisplay(quiz: QuizPayload, index: number): CorrectDisplay {
  switch (quiz.format) {
    case "CHOICE":
    case "MULTI_MEANING":
      // 正解は最初の Meaning の訳語。生成時に切り出した訳語順の配列をそのまま渡す
      return { texts: quiz.questions[index].correctMeaningTexts, emphasizeFirst: true };
    case "CHOICE_JA_EN":
    case "CHOICE_TG":
    case "CHOICE_TG_JA_EN": {
      // 訳語以外の四択の正解は正解選択肢のテキスト（英単語 / TG 例文の意味 / TG 例文の英文）
      const question = quiz.questions[index];
      return {
        texts: [question.choices[question.correctIndex]?.text ?? ""],
        emphasizeFirst: false,
      };
    }
    case "SELF_JUDGE": {
      // 解答表示（全 Meaning）と同じ payload から最初の Meaning の訳語だけを取り出す
      const question = quiz.questions[index];
      return { texts: question.answer[0]?.texts ?? [], emphasizeFirst: true };
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
