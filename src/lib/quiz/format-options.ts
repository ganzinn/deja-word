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
      {
        value: "CHOICE_TG",
        label: "TG四択",
        description: "TG例文の英文に合う意味を 4 つの選択肢から選ぶ",
      },
      {
        value: "SELF_JUDGE_TG",
        label: "TG自己判定",
        description: "TG例文の英文を見て意味を思い出し、自分で正誤を判定する",
      },
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
      {
        value: "CHOICE_TG_JA_EN",
        label: "TG四択",
        description: "TG例文の意味に合う英文を 4 つの選択肢から選ぶ",
      },
      {
        value: "SELF_JUDGE_TG_JA_EN",
        label: "TG自己判定",
        description: "TG例文の意味を見て英文を思い出し、自分で正誤を判定する",
      },
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
 * 日本語→英語（出題が日本語の意味、解答が英語）の出題形式。
 * 発音（headword）が解答を漏らす向きのため、出題時の発音自動再生を抑止する（quiz-flow）。
 * 見出しの表示出し分けはここではなく quiz-flow の `promptViewOf`（形式網羅 switch）が担う。
 * CHOICE_TG（英→日）は英文が問題文に見えているため含めない（自動再生あり）。
 */
const JA_TO_EN_FORMATS = new Set<QuizFormat>([
  "CHOICE_JA_EN",
  "SELF_JUDGE_JA_EN",
  "SPELLING",
  // TG四択（日→英）は選択肢の英文に headword が含まれ、発音が解答漏れになる
  "CHOICE_TG_JA_EN",
  // TG自己判定（日→英）は解答の英文に headword が含まれ、発音が解答漏れになる
  "SELF_JUDGE_TG_JA_EN",
]);

/** 日本語→英語の出題形式か（発音＝解答漏れになるため、出題時の発音自動再生を抑止する向き）。 */
export function isJaToEnFormat(format: QuizFormat): boolean {
  return JA_TO_EN_FORMATS.has(format);
}

/**
 * TG 例文（Example.kind=TARGET）を素材とする出題形式。
 * 出題対象が「使える TG 例文（意味つき）を持つ単語」に絞られるため、
 * プレビューの対象件数・除外内訳がこの判定で format 依存になる。
 */
const TG_EXAMPLE_FORMATS = new Set<QuizFormat>([
  "CHOICE_TG",
  "CHOICE_TG_JA_EN",
  "SELF_JUDGE_TG",
  "SELF_JUDGE_TG_JA_EN",
]);

/** TG 例文を素材とする出題形式か（対象件数のカウントが TG 例文の有無で絞られる）。 */
export function isTgExampleFormat(format: QuizFormat): boolean {
  return TG_EXAMPLE_FORMATS.has(format);
}

/** 自己判定（解答を見て本人が正誤を申告する）の出題形式。 */
const SELF_JUDGE_FORMATS = new Set<QuizFormat>([
  "SELF_JUDGE",
  "SELF_JUDGE_JA_EN",
  "SELF_JUDGE_TG",
  "SELF_JUDGE_TG_JA_EN",
]);

/** 自己判定の出題形式か（本人が正誤を申告するため正誤フラッシュ・効果音を出さない）。 */
export function isSelfJudgeFormat(format: QuizFormat): boolean {
  return SELF_JUDGE_FORMATS.has(format);
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
