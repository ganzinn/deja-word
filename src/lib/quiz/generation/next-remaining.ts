// drill 残数遷移（06-drill-mode.md 決定 1 / 05-architecture.md 決定 4）。

import type { QuizResult } from "@/generated/prisma/enums";

/** 卒業までの残連続正解数の上限（間違い時のリセット値）。 */
export const DRILL_RESET_REMAINING = 3;

/** 正解で −1（下限 0）、間違い（GAVE_UP 含む）で 3 にリセット。0 で卒業。 */
export function nextRemaining(current: number, result: QuizResult): number {
  switch (result) {
    case "CORRECT":
      return Math.max(0, current - 1);
    case "INCORRECT":
    case "GAVE_UP":
      return DRILL_RESET_REMAINING;
    default: {
      const exhaustive: never = result;
      throw new Error(`Unexpected quiz result: ${String(exhaustive)}`);
    }
  }
}
