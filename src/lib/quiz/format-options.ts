import type { QuizFormat } from "@/generated/prisma/enums";

/**
 * 出題形式の表示用データ（カテゴリ見出し＋ラベル・説明）。
 * 開始画面（start-form）とデフォルト設定画面（quiz-defaults-form）で共有し、
 * 文言のドリフトを防ぐ。UI 構造は各画面が持つ（共通コンポーネント化はしない）。
 */
export const FORMAT_GROUPS: {
  category: string;
  options: { value: QuizFormat; label: string; description: string }[];
}[] = [
  {
    category: "英語→日本語",
    options: [
      { value: "CHOICE", label: "四択", description: "4 つの選択肢から正しい意味を選ぶ" },
      { value: "SELF_JUDGE", label: "自己判定", description: "解答を見て自分で正誤を判定する" },
      { value: "MULTI_MEANING", label: "多義語選択", description: "正しい意味をすべて選ぶ" },
    ],
  },
  {
    category: "日本語→英語",
    options: [
      { value: "CHOICE_JA_EN", label: "四択", description: "4 つの選択肢から正しい英単語を選ぶ" },
      {
        value: "SELF_JUDGE_JA_EN",
        label: "自己判定",
        description: "解答を見て自分で正誤を判定する",
      },
      { value: "SPELLING", label: "スペル確認", description: "英単語のスペルを入力して答える" },
    ],
  },
];

/**
 * 全出題形式の平坦リスト（FORMAT_GROUPS から導出）。形式リストの単一の出どころ。
 * lib・zod・フォームが「全形式を走査する」処理で共有し、形式追加が enum 値＋
 * FORMAT_GROUPS への追記だけで波及するようにする。
 */
export const ALL_QUIZ_FORMATS: QuizFormat[] = FORMAT_GROUPS.flatMap((g) =>
  g.options.map((o) => o.value),
);

/**
 * 日本語→英語（出題が日本語の意味、解答が英単語）の出題形式。
 * 出題画面の問題文表示（headword か意味か）と問題生成の正解側がこの向きで反転する。
 */
const JA_TO_EN_FORMATS = new Set<QuizFormat>(["CHOICE_JA_EN", "SELF_JUDGE_JA_EN", "SPELLING"]);

/** 日本語→英語の出題形式か（問題文に意味を表示し、英単語を解答とする向き）。 */
export function isJaToEnFormat(format: QuizFormat): boolean {
  return JA_TO_EN_FORMATS.has(format);
}

/**
 * 出題形式を単一の表示用ラベルに変換する（例「英語→日本語・四択」）。
 * `label` だけだとカテゴリ間で重複する（「四択」など）ため、向き（category）を併記する。
 * 文言は FORMAT_GROUPS を単一の出どころとして再利用しドリフトを防ぐ。
 */
export function formatLabelOf(format: QuizFormat): string {
  for (const group of FORMAT_GROUPS) {
    const option = group.options.find((o) => o.value === format);
    if (option) return `${group.category}・${option.label}`;
  }
  // ALL_QUIZ_FORMATS と同じ出どころのため通常到達しない。型の網羅性が崩れた場合のフォールバック。
  return format;
}
