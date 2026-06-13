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
  // 将来: { category: "日本語→英語", options: [SPELLING, SELF_JUDGE_JA_EN] }
];

/**
 * 全出題形式の平坦リスト（FORMAT_GROUPS から導出）。形式リストの単一の出どころ。
 * lib・zod・フォームが「全形式を走査する」処理で共有し、形式追加が enum 値＋
 * FORMAT_GROUPS への追記だけで波及するようにする。
 */
export const ALL_QUIZ_FORMATS: QuizFormat[] = FORMAT_GROUPS.flatMap((g) =>
  g.options.map((o) => o.value),
);
