import type { QuizFormat } from "@/generated/prisma/enums";

/**
 * 出題形式の表示用データ（ラベル・説明）。
 * 開始画面（start-form）とデフォルト設定画面（quiz-defaults-form）で共有し、
 * 文言のドリフトを防ぐ。UI 構造は各画面が持つ（共通コンポーネント化はしない）。
 */
export const FORMAT_OPTIONS: { value: QuizFormat; label: string; description: string }[] = [
  { value: "CHOICE", label: "四択", description: "4 つの選択肢から正しい意味を選ぶ" },
  { value: "SELF_JUDGE", label: "自己判定", description: "解答を見て自分で正誤を判定する" },
  { value: "MULTI_MEANING", label: "多義語選択", description: "正しい意味をすべて選ぶ" },
];
