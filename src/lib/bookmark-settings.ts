import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";
import { buildWordListWhere, buildWordsByOccurrenceWhere } from "@/lib/words-list";

import type { RemoveBookmarksByFilterInput } from "@/lib/schema/bookmark";

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
 * 与えた wordIds を本人のブックマークへ一括登録する（純 per-user 設定）。
 *
 * 対象 word を scoped 検証し（system 掲載の共有マスタ単語には付与可）、削除済み・
 * 範囲外は理由を区別せずまとめて skip して残りを登録する。全件が弾かれてもエラーに
 * しない（1 件版 `setBookmarkForUser` が範囲外を throw するのとの非対称は意図的:
 * docs/adr/0094-bulk-bookmark-skip-and-colocation.md）。
 *
 * 検証と登録は同一トランザクションで実行し、失敗は常に全体失敗（部分適用なし）。
 * 書き込み先は本人行（userId 固定）のみで、冪等なので再実行が安全。
 * 戻り値の 2 配列はいずれも集合（順序非保証・重複なし）。`bookmarkedWordIds` は
 * 操作後に ON 状態にある wordId 群で、新規か既存かは区別しない。
 */
export async function addBookmarksForUser(
  userId: string,
  wordIds: readonly string[],
): Promise<{ bookmarkedWordIds: string[]; skippedWordIds: string[] }> {
  const uniqueIds = [...new Set(wordIds)];

  return prisma.$transaction(async (tx) => {
    const words = await tx.word.findMany({
      where: { id: { in: uniqueIds }, ownerId: { in: scopedOwnerIds(userId) } },
      select: { id: true },
    });
    const validIds = words.map((w) => w.id);

    // 空配列への createMany は無駄な INSERT になるため発行しない。
    if (validIds.length > 0) {
      await tx.bookmark.createMany({
        data: validIds.map((wordId) => ({ userId, wordId })),
        skipDuplicates: true,
      });
    }

    const validIdSet = new Set(validIds);
    return {
      bookmarkedWordIds: validIds,
      skippedWordIds: uniqueIds.filter((id) => !validIdSet.has(id)),
    };
  });
}

/**
 * 単語一覧の「ブックマークのみ」絞り込みに一致するブックマークをまとめて解除する
 * （純 per-user 設定）。対象は表示中ページではなく絞り込み結果の全件で、一覧と同じ
 * where builder（words-list.ts）で条件を再評価して deleteMany する（表示集合と解除集合の
 * 定義を乖離させない。設計: docs/adr/0104-bulk-unbookmark-by-filter.md）。
 * 削除は本人行のみ（userId 固定）のため対象 word の scoped 検証は不要で、範囲外の
 * occurrenceId は builder の ownerId 条件により空集合＝0 件解除の正常系になる
 * （`getBookmarkedWordIdsForUser` と同じ理由づけ）。
 */
export async function removeBookmarksForUser(
  userId: string,
  filter: RemoveBookmarksByFilterInput,
): Promise<{ removedCount: number }> {
  const wordWhere =
    filter.kind === "word"
      ? buildWordListWhere(userId, { q: filter.q, match: filter.match, bookmarkedOnly: true })
      : {
          wordOccurrences: {
            some: buildWordsByOccurrenceWhere(userId, {
              occurrenceId: filter.occurrenceId,
              q: filter.q,
              match: filter.match,
              from: filter.from,
              to: filter.to,
              bookmarkedOnly: true,
            }),
          },
        };

  const { count } = await prisma.bookmark.deleteMany({
    where: { userId, word: wordWhere },
  });
  return { removedCount: count };
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
