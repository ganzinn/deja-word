import "server-only";

import { prisma } from "@/lib/prisma";
import {
  applyDrillRound,
  type DrillRoundInput,
  type DrillRoundResult,
} from "@/lib/quiz/handlers/drill-round-handler";

/**
 * drill ラウンド終了時の履歴一括送信＋残数更新を同一トランザクションで行う薄い UseCase。
 *
 * 冪等性（roundCount CAS）・完了判定（completedAt）は `applyDrillRound` が担う
 * （docs/adr/0033-drill-round-count-cas.md）。
 */
export async function submitDrillRoundForUser(
  userId: string,
  input: DrillRoundInput,
): Promise<DrillRoundResult> {
  return prisma.$transaction((tx) => applyDrillRound(tx, userId, input));
}
