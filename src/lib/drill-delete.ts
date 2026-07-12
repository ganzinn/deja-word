import "server-only";

import { prisma } from "@/lib/prisma";
import { DrillNotFoundError } from "@/lib/quiz/handlers/drill-round-handler";

/**
 * drill を物理削除する（docs/adr/0010-no-soft-delete.md）。
 *
 * - `ownerId: userId` 照合のうえ削除（DrillWord は Cascade で消える）
 * - QuizAnswer は Drill への FK を持たないため解答履歴は無傷で残る
 */
export async function deleteDrillForUser(userId: string, drillId: string): Promise<void> {
  const { count } = await prisma.drill.deleteMany({
    where: { id: drillId, ownerId: userId },
  });
  if (count === 0) throw new DrillNotFoundError();
}
