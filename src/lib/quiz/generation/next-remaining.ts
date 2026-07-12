// drill 残数遷移（docs/adr/0036-drill-remaining-count-model.md / docs/adr/0033-drill-round-count-cas.md）。
// 残数値（誤答リセット / うろ覚え / 正答初期）はテスト開始時にユーザーが設定でき、
// drill ごとに `Drill` 行へ永続化される。生成時もラウンド遷移時も drill の値を使う。

import type { QuizResult } from "@/generated/prisma/enums";
import {
  DEFAULT_INITIAL_CORRECT_REMAINING,
  DEFAULT_RESET_REMAINING,
  DEFAULT_VAGUE_REMAINING,
} from "@/lib/quiz/remaining-options";

/** drill の残数設定（誤答リセット / うろ覚え / 正答初期）。drill ごとに固定。 */
export type DrillRemainingConfig = {
  /** 定着までの残連続正解数の上限（誤答・GAVE_UP・TIMEOUT 時のリセット値）。 */
  resetRemaining: number;
  /** うろ覚え（VAGUE）のリセット値。正解と不正解の中間。 */
  vagueRemaining: number;
  /** テスト正答組の drill 投入時の初期残数。 */
  initialCorrectRemaining: number;
};

/** 既定の残数設定（誤答=3 / うろ覚え=2 / 正答=1）。未設定ユーザー・seed・テストの基準。 */
export const DEFAULT_DRILL_REMAINING_CONFIG: DrillRemainingConfig = {
  resetRemaining: DEFAULT_RESET_REMAINING,
  vagueRemaining: DEFAULT_VAGUE_REMAINING,
  initialCorrectRemaining: DEFAULT_INITIAL_CORRECT_REMAINING,
};

/**
 * テスト結果から drill へ投入する単語の初期残数（誤答=resetRemaining / うろ覚え=vagueRemaining /
 * 正答=initialCorrectRemaining）。正答は drillIncludeCorrect=true のときだけ投入されるため、
 * CORRECT の値は ON 時のみ使われる。投入後のラウンドでの遷移は nextRemaining が担う
 * （初期値と遷移リセット値で意図的に値が異なる）。
 */
export function initialRemaining(result: QuizResult, config: DrillRemainingConfig): number {
  switch (result) {
    case "CORRECT":
      return config.initialCorrectRemaining;
    case "VAGUE":
      return config.vagueRemaining;
    case "INCORRECT":
    case "GAVE_UP":
    case "TIMEOUT":
      return config.resetRemaining;
    default: {
      const exhaustive: never = result;
      throw new Error(`Unexpected quiz result: ${String(exhaustive)}`);
    }
  }
}

/**
 * 正解で −1（下限 0）、うろ覚え（VAGUE）で vagueRemaining にリセット、
 * 間違い（GAVE_UP / TIMEOUT 含む）で resetRemaining にリセット。0 で定着。
 */
export function nextRemaining(
  current: number,
  result: QuizResult,
  config: DrillRemainingConfig,
): number {
  switch (result) {
    case "CORRECT":
      return Math.max(0, current - 1);
    case "VAGUE":
      return config.vagueRemaining;
    case "INCORRECT":
    case "GAVE_UP":
    case "TIMEOUT":
      return config.resetRemaining;
    default: {
      const exhaustive: never = result;
      throw new Error(`Unexpected quiz result: ${String(exhaustive)}`);
    }
  }
}
