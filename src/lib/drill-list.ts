import "server-only";

import type { QuizFormat } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** 進行中一覧の 1 行（04-ui.md「開始画面（/quiz）」の表示項目）。チケット 10 の UI が使う。 */
export type ActiveDrill = {
  id: string;
  occurrenceName: string; // Occurrence の表示名
  rangeFrom: number;
  rangeTo: number;
  format: QuizFormat;
  timeoutSeconds: number | null; // 1 問あたりの制限時間（null = 制限なし）
  remainingWordCount: number; // remaining > 0 の DrillWord 数
  lastPlayedAt: Date; // Drill.updatedAt
};

/**
 * 進行中（completedAt IS NULL）の drill 一覧を返す。
 * Drill は常にユーザー単独所有のため `ownerId: userId` で照合（05-architecture.md 決定 5）。
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
    occurrenceName: d.occurrence.location,
    rangeFrom: d.rangeFrom,
    rangeTo: d.rangeTo,
    format: d.format,
    timeoutSeconds: d.timeoutSeconds,
    remainingWordCount: d._count.words,
    lastPlayedAt: d.updatedAt,
  }));
}
