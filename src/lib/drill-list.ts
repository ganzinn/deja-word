import "server-only";

import type { QuizFormat } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** 進行中一覧の 1 行の表示項目。 */
export type ActiveDrill = {
  id: string;
  occurrenceName: string | null; // Occurrence の表示名（全件モード drill では null）
  rangeFrom: number | null; // 実効範囲（全件モード drill では null）
  rangeTo: number | null;
  format: QuizFormat;
  timeoutSeconds: number | null; // 1 問あたりの制限時間（null = 制限なし）
  remainingWordCount: number; // remaining > 0 の DrillWord 数
  lastPlayedAt: Date; // Drill.updatedAt
};

/**
 * 進行中（completedAt IS NULL）の drill 一覧を返す。
 * Drill は常にユーザー単独所有のため `ownerId: userId` で照合（docs/adr/0018-scoped-owner-ids-read-scope.md）。
 */
export async function listActiveDrillsForUser(userId: string): Promise<ActiveDrill[]> {
  const drills = await prisma.drill.findMany({
    where: { ownerId: userId, completedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      rangeFrom: true,
      rangeTo: true,
      format: true,
      timeoutSeconds: true,
      updatedAt: true,
      occurrence: { select: { location: true } },
      _count: { select: { words: { where: { remaining: { gt: 0 } } } } },
    },
  });
  return drills.map((d) => ({
    id: d.id,
    // 全件モード drill は occurrence が null。表示ラベルの null 対応は 09。
    occurrenceName: d.occurrence?.location ?? null,
    rangeFrom: d.rangeFrom,
    rangeTo: d.rangeTo,
    format: d.format,
    timeoutSeconds: d.timeoutSeconds,
    remainingWordCount: d._count.words,
    lastPlayedAt: d.updatedAt,
  }));
}
