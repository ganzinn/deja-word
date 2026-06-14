import "server-only";

import { prisma } from "@/lib/prisma";

export type AutoNumberOccurrence = {
  id: string;
  ownerId: string;
  location: string;
  /** この掲載箇所に次に付与すべき掲載番号（既存の最大値 + 1、単語ゼロなら 1） */
  nextNumber: number;
};

/**
 * 自分の掲載箇所のうち「掲載番号の自動採番」が ON のものを、次番号付きで返す。
 *
 * 次番号 = その掲載箇所の occurrenceNumber の最大値 + 1（gap があっても max+1、単語ゼロなら 1）。
 * 「自分の掲載箇所のみ適用可能」なので own（ownerId === userId）に限定する。
 */
export async function getAutoNumberOccurrencesForUser(
  userId: string,
): Promise<AutoNumberOccurrence[]> {
  const occs = await prisma.occurrence.findMany({
    where: { ownerId: userId, autoNumbering: true },
    select: { id: true, ownerId: true, location: true },
    orderBy: [{ sortOrder: "asc" }, { location: "asc" }],
  });
  if (occs.length === 0) return [];

  const maxes = await prisma.wordOccurrence.groupBy({
    by: ["occurrenceId"],
    where: { occurrenceId: { in: occs.map((o) => o.id) } },
    _max: { occurrenceNumber: true },
  });
  const maxById = new Map(maxes.map((m) => [m.occurrenceId, m._max.occurrenceNumber ?? 0]));

  return occs.map((o) => ({ ...o, nextNumber: (maxById.get(o.id) ?? 0) + 1 }));
}

/** 自動採番対象の掲載箇所 id → 次番号 のマップ（プリセット再選択時の自動入力に使う）。 */
export async function getAutoNumberMapForUser(userId: string): Promise<Record<string, number>> {
  const occs = await getAutoNumberOccurrencesForUser(userId);
  return Object.fromEntries(occs.map((o) => [o.id, o.nextNumber]));
}
