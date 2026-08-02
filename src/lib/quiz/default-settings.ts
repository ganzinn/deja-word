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
  bookmarkedOnly: null,
  questionCount: null,
  format: "CHOICE",
  timeoutByFormat: {
    CHOICE: 5,
    SELF_JUDGE: 3,
    MULTI_MEANING: null,
    CHOICE_JA_EN: 5,
    SELF_JUDGE_JA_EN: 3,
    SPELLING: null,
    CHOICE_TG: 5,
    CHOICE_TG_JA_EN: 5,
    SELF_JUDGE_TG: 3,
    SELF_JUDGE_TG_JA_EN: 3,
  },
  showCountdown: false,
  autoplayPronunciation: true,
  enableAnswerSound: true,
  autoplayAnswerAudioJaEn: true,
  choiceFirstMeaningTextOnly: true,
  orderByOccurrenceNumber: false,
  drillIncludeCorrect: false,
  resetRemaining: 3,
  vagueRemaining: 2,
  initialCorrectRemaining: 1,
  saveOnStart: false,
};
