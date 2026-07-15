import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

export class BookmarkWordNotInScopeError extends Error {
  constructor() {
    super("bookmark word is not in scope");
    this.name = "BookmarkWordNotInScopeError";
  }
}

/**
 * 本人の単語ブックマークを冪等に付け外しする（純 per-user 設定）。
 * ON / OFF とも対象 word を scoped 検証し（system 掲載の共有マスタ単語には付与可、
 * 他ユーザーの単語は拒否）、書き込み先は本人行（userId 固定）のみ。
 */
export async function setBookmarkForUser(
  userId: string,
  wordId: string,
  bookmarked: boolean,
): Promise<void> {
  const word = await prisma.word.findFirst({
    where: { id: wordId, ownerId: { in: scopedOwnerIds(userId) } },
    select: { id: true },
  });
  if (!word) throw new BookmarkWordNotInScopeError();

  if (bookmarked) {
    await prisma.bookmark.upsert({
      where: { userId_wordId: { userId, wordId } },
      create: { userId, wordId },
      update: {},
    });
  } else {
    await prisma.bookmark.deleteMany({
      where: { userId, wordId },
    });
  }
}

/**
 * 与えた wordIds のうち本人がブックマーク済みの wordId 一覧を返す。
 * 本人行のみの read のため wordIds の scoped 検証は不要（範囲外・削除済みは
 * 非ヒット＝未ブックマーク扱いになり、他人のデータは漏れない）。
 */
export async function getBookmarkedWordIdsForUser(
  userId: string,
  wordIds: readonly string[],
): Promise<string[]> {
  const rows = await prisma.bookmark.findMany({
    where: { userId, wordId: { in: [...wordIds] } },
    select: { wordId: true },
  });
  return rows.map((r) => r.wordId);
}
