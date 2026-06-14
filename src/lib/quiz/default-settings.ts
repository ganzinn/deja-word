import type { QuizDefaults } from "@/lib/quiz-default-settings";

/**
 * 「デフォルト設定に戻す」で復元する推奨初期値。
 * クライアントコンポーネント（quiz-defaults-form）から import するため、
 * server-only な quiz-default-settings.ts ではなくここに置く（型のみ流用）。
 * timeoutByFormat は全形式キー必須。形式追加時はここがコンパイルエラーになり更新が強制される。
 */
export const DEFAULT_QUIZ_SETTINGS: QuizDefaults = {
  occurrenceId: null,
  rangeFrom: null,
  rangeTo: null,
  format: "CHOICE",
  timeoutByFormat: { CHOICE: 5, SELF_JUDGE: 3, MULTI_MEANING: null },
  showCountdown: false,
  autoplayPronunciation: true,
  enableAnswerSound: true,
};
