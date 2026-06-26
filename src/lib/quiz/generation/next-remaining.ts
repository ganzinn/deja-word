// drill 残数遷移（06-drill-mode.md 決定 1 / 05-architecture.md 決定 4）。

import type { QuizResult } from "@/generated/prisma/enums";

/** 定着までの残連続正解数の上限（間違い時のリセット値）。 */
export const DRILL_RESET_REMAINING = 3;

/** うろ覚え（VAGUE）のリセット値。正解(−1)と不正解(3)の中間。 */
export const DRILL_VAGUE_REMAINING = 2;

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
