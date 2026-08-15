import type { QuizPayload } from "@/lib/quiz/payload";

/**
 * 問題文（見出し）の表示データ（形式網羅 switch。形式追加時の更新漏れを型で検出する）。
 * 出題画面の見出しと結果一覧の主見出しで共有し、結果一覧の TG ハイライト・発音ボタンの行も
 * kind から導出される（`ResultRow.prompt`）。
 */
export type PromptView =
  /** 英→日（見出しは英単語。問題文として持つデータは無い）。 */
  | { kind: "headword" }
  /**
   * 日→英（見出しは最初の Meaning の訳語。headword・発音は解答のため伏せる）。
   * texts は描画側で「; 」連結し、emphasizeFirst なら先頭の訳語を赤字にする（生成時に決まる）。
   */
  | { kind: "ja-plain"; texts: string[]; emphasizeFirst: boolean }
  /** TG四択（英→日）: TG 例文の英文をハイライト表示（headword は英文中に含まれるため出さない）。 */
  | { kind: "tg-text"; text: string }
  /** TG四択（日→英）: TG 例文の意味をハイライト表示（headword・発音は解答のため伏せる）。 */
  | { kind: "tg-meaning"; text: string };

/** 問題文の表示種別。表示内容ではなく種別だけで足りる分岐（発音ボタンの行など）が使う。 */
export type PromptKind = PromptView["kind"];

/** 形式から問題文（見出し）の表示データを導出する。 */
export function promptViewOf(quiz: QuizPayload, index: number): PromptView {
  switch (quiz.format) {
    case "CHOICE":
    case "SELF_JUDGE":
    case "MULTI_MEANING":
      return { kind: "headword" };
    case "CHOICE_JA_EN":
    case "SELF_JUDGE_JA_EN":
    case "SPELLING":
      return { kind: "ja-plain", ...quiz.questions[index].prompt };
    case "CHOICE_TG":
    case "SELF_JUDGE_TG":
      return { kind: "tg-text", text: quiz.questions[index].prompt };
    case "CHOICE_TG_JA_EN":
    case "SELF_JUDGE_TG_JA_EN":
      return { kind: "tg-meaning", text: quiz.questions[index].prompt };
  }
}
