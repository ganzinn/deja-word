// drill 残数遷移（06-drill-mode.md 決定 1 / 05-architecture.md 決定 4）。

import type { QuizResult } from "@/generated/prisma/enums";

/** 定着までの残連続正解数の上限（間違い時のリセット値）。 */
export const DRILL_RESET_REMAINING = 3;

/** うろ覚え（VAGUE）のリセット値。正解(−1)と不正解(3)の中間。 */
export const DRILL_VAGUE_REMAINING = 2;

/** テスト正解組の drill 投入時の初期残数（1 回正解すれば定着）。 */
export const DRILL_INITIAL_REMAINING_CORRECT = 1;

/**
 * テスト結果から drill へ投入する単語の初期残数（誤答=3 / うろ覚え=2 / 正答=1）。
 * 正答は drillIncludeCorrect=true のときだけ投入されるため、CORRECT の値は ON 時のみ使われる。
 * 投入後のラウンドでの遷移は nextRemaining が担う（初期値と遷移リセット値で意図的に値が異なる）。
 */
export function initialRemaining(result: QuizResult): number {
  switch (result) {
    case "CORRECT":
      return DRILL_INITIAL_REMAINING_CORRECT;
    case "VAGUE":
      return DRILL_VAGUE_REMAINING;
    case "INCORRECT":
    case "GAVE_UP":
    case "TIMEOUT":
      return DRILL_RESET_REMAINING;
    default: {
      const exhaustive: never = result;
      throw new Error(`Unexpected quiz result: ${String(exhaustive)}`);
    }
  }
}

/** 正解で −1（下限 0）、うろ覚え（VAGUE）で 2 にリセット、間違い（GAVE_UP / TIMEOUT 含む）で 3 にリセット。0 で定着。 */
export function nextRemaining(current: number, result: QuizResult): number {
  switch (result) {
    case "CORRECT":
      return Math.max(0, current - 1);
    case "VAGUE":
      return DRILL_VAGUE_REMAINING;
    case "INCORRECT":
    case "GAVE_UP":
    case "TIMEOUT":
      return DRILL_RESET_REMAINING;
    default: {
      const exhaustive: never = result;
      throw new Error(`Unexpected quiz result: ${String(exhaustive)}`);
    }
  }
}
