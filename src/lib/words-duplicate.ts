import "server-only";

import { prisma } from "@/lib/prisma";

export type HeadwordDuplicate = { id: string; headword: string };

/**
 * 自分が既に同じ headword の単語を持っているかを完全一致で照会する。
 * submit 時の DB unique 制約 `@@unique([ownerId, headword])` と挙動を揃える:
 * - 対象は自分の単語のみ（`ownerId = userId`）。共通語(system 語)は別 ownerId なので対象外。
 * - 大文字小文字を区別した完全一致（Prisma で `mode` を付けない＝Postgres デフォルト）。
 * - 編集時は対象自身を除外するため `excludeWordId` を渡す。
 */
export async function findOwnHeadwordDuplicate(
  userId: string,
  headword: string,
  excludeWordId?: string,
): Promise<HeadwordDuplicate | null> {
  const hw = headword.trim();
  if (hw.length === 0) return null;

  return prisma.word.findFirst({
    where: {
      ownerId: userId,
      headword: hw,
      ...(excludeWordId ? { id: { not: excludeWordId } } : {}),
    },
    select: { id: true, headword: true },
  });
}
