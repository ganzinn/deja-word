import { describe, expect, test } from "vitest";

import {
  addBookmarksForUser,
  BookmarkWordNotInScopeError,
  getBookmarkedWordIdsForUser,
  removeBookmarksForUser,
  setBookmarkForUser,
} from "@/lib/bookmark-settings";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import {
  createOccurrenceRow,
  createQuizWordRow,
  createTestUser,
  createWordRow,
} from "../../tests/setup/fixtures";

describe("setBookmarkForUser", () => {
  test("bookmarked=true creates a record (upsert) and the second call is a no-op", async () => {
    const user = await createTestUser();
    const word = await createWordRow(user.id, "自前単語");
    await setBookmarkForUser(user.id, word.id, true);
    await setBookmarkForUser(user.id, word.id, true);
    const count = await prisma.bookmark.count({
      where: { userId: user.id, wordId: word.id },
    });
    expect(count).toBe(1);
  });

  test("bookmarked=false deletes the record, and is safe even when record is absent", async () => {
    const user = await createTestUser();
    const word = await createWordRow(user.id, "自前単語");
    await setBookmarkForUser(user.id, word.id, false);
    await setBookmarkForUser(user.id, word.id, false);
    const count = await prisma.bookmark.count({
      where: { userId: user.id, wordId: word.id },
    });
    expect(count).toBe(0);
  });

  test("throws when word is outside scopedOwnerIds(userId)", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const bWord = await createWordRow(b.id, "Bの単語");
    await expect(setBookmarkForUser(a.id, bWord.id, true)).rejects.toBeInstanceOf(
      BookmarkWordNotInScopeError,
    );
    const count = await prisma.bookmark.count({ where: { wordId: bWord.id } });
    expect(count).toBe(0);
  });

  test("regular user can bookmark a system-owned word", async () => {
    const user = await createTestUser();
    const sysWord = await createWordRow(SYSTEM_USER_ID, "共有マスタ単語");
    await setBookmarkForUser(user.id, sysWord.id, true);
    const count = await prisma.bookmark.count({
      where: { userId: user.id, wordId: sysWord.id },
    });
    expect(count).toBe(1);
  });
});

describe("addBookmarksForUser", () => {
  test("bookmarks all valid wordIds at once", async () => {
    const user = await createTestUser();
    const w1 = await createWordRow(user.id, "単語1");
    const w2 = await createWordRow(user.id, "単語2");

    const result = await addBookmarksForUser(user.id, [w1.id, w2.id]);
    expect(result.bookmarkedWordIds.sort()).toEqual([w1.id, w2.id].sort());
    expect(result.skippedWordIds).toEqual([]);

    const rows = await prisma.bookmark.findMany({
      where: { userId: user.id },
      select: { wordId: true },
    });
    expect(rows.map((r) => r.wordId).sort()).toEqual([w1.id, w2.id].sort());
  });

  test("is idempotent: already-bookmarked ids mix in without duplicating rows", async () => {
    const user = await createTestUser();
    const w1 = await createWordRow(user.id, "単語1");
    const w2 = await createWordRow(user.id, "単語2");
    await setBookmarkForUser(user.id, w1.id, true);

    const first = await addBookmarksForUser(user.id, [w1.id, w2.id]);
    // 既存か新規かは区別せず、操作後に ON の wordId をまとめて返す。
    expect(first.bookmarkedWordIds.sort()).toEqual([w1.id, w2.id].sort());
    const countAfterFirst = await prisma.bookmark.count({ where: { userId: user.id } });
    expect(countAfterFirst).toBe(2);

    const second = await addBookmarksForUser(user.id, [w1.id, w2.id]);
    expect(second.bookmarkedWordIds.sort()).toEqual([w1.id, w2.id].sort());
    expect(await prisma.bookmark.count({ where: { userId: user.id } })).toBe(2);
  });

  test("dedupes the input (duplicate wordIds are collapsed)", async () => {
    const user = await createTestUser();
    const w1 = await createWordRow(user.id, "単語1");

    const result = await addBookmarksForUser(user.id, [w1.id, w1.id]);
    expect(result.bookmarkedWordIds).toEqual([w1.id]);
    expect(await prisma.bookmark.count({ where: { userId: user.id } })).toBe(1);
  });

  test("skips out-of-scope ids and still bookmarks the rest (no side effect on skipped)", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const aWord = await createWordRow(a.id, "Aの単語");
    const bWord = await createWordRow(b.id, "Bの単語");

    const result = await addBookmarksForUser(a.id, [aWord.id, bWord.id, "w_missing"]);
    expect(result.bookmarkedWordIds).toEqual([aWord.id]);
    expect(result.skippedWordIds.sort()).toEqual([bWord.id, "w_missing"].sort());

    expect(await prisma.bookmark.count({ where: { userId: a.id, wordId: bWord.id } })).toBe(0);
    expect(await prisma.bookmark.count({ where: { userId: a.id } })).toBe(1);
  });

  test("all ids out of scope succeeds with an empty bookmarkedWordIds", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const bWord = await createWordRow(b.id, "Bの単語");

    const result = await addBookmarksForUser(a.id, [bWord.id, "w_missing"]);
    expect(result.bookmarkedWordIds).toEqual([]);
    expect(result.skippedWordIds.sort()).toEqual([bWord.id, "w_missing"].sort());
    expect(await prisma.bookmark.count({ where: { userId: a.id } })).toBe(0);
  });

  test("regular user can bulk-bookmark system-owned words", async () => {
    const user = await createTestUser();
    const sysWord = await createWordRow(SYSTEM_USER_ID, "共有マスタ単語");

    const result = await addBookmarksForUser(user.id, [sysWord.id]);
    expect(result.bookmarkedWordIds).toEqual([sysWord.id]);
    expect(await prisma.bookmark.count({ where: { userId: user.id, wordId: sysWord.id } })).toBe(1);
  });
});

describe("getBookmarkedWordIdsForUser", () => {
  test("returns only the bookmarked wordIds among the given ids", async () => {
    const user = await createTestUser();
    const w1 = await createWordRow(user.id, "単語1");
    const w2 = await createWordRow(user.id, "単語2");
    const w3 = await createWordRow(user.id, "単語3");
    await setBookmarkForUser(user.id, w1.id, true);
    await setBookmarkForUser(user.id, w3.id, true);

    const result = await getBookmarkedWordIdsForUser(user.id, [w1.id, w2.id, w3.id]);
    expect(result.sort()).toEqual([w1.id, w3.id].sort());
  });

  test("does not leak another user's bookmarks", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const word = await createWordRow(SYSTEM_USER_ID, "共有マスタ単語");
    await setBookmarkForUser(b.id, word.id, true);

    const result = await getBookmarkedWordIdsForUser(a.id, [word.id]);
    expect(result).toEqual([]);
  });

  test("returns an empty array for an empty wordIds input", async () => {
    const user = await createTestUser();
    const result = await getBookmarkedWordIdsForUser(user.id, []);
    expect(result).toEqual([]);
  });
});

describe("removeBookmarksForUser", () => {
  test("word ビュー: 絞り込みに一致する自分のブックマークだけを解除する", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const apple = await createWordRow(user.id, "apple");
    const apricot = await createWordRow(user.id, "apricot");
    const banana = await createWordRow(user.id, "banana");
    const otherApple = await createWordRow(other.id, "apple");
    await prisma.bookmark.createMany({
      data: [
        { userId: user.id, wordId: apple.id },
        { userId: user.id, wordId: apricot.id },
        { userId: user.id, wordId: banana.id },
        { userId: other.id, wordId: otherApple.id },
      ],
    });

    const { removedCount } = await removeBookmarksForUser(user.id, {
      kind: "word",
      q: "ap",
      match: "prefix",
    });

    expect(removedCount).toBe(2);
    const remaining = await prisma.bookmark.findMany({
      select: { userId: true, wordId: true },
    });
    expect(remaining).toHaveLength(2);
    expect(remaining).toEqual(
      expect.arrayContaining([
        { userId: user.id, wordId: banana.id },
        { userId: other.id, wordId: otherApple.id },
      ]),
    );
  });

  test("word ビュー: キーワードなしは自分の全ブックマークを解除する（system 単語のブックマーク含む）", async () => {
    const user = await createTestUser();
    const own = await createWordRow(user.id, "自前単語");
    const sysWord = await createWordRow(SYSTEM_USER_ID, "共有マスタ単語");
    await prisma.bookmark.createMany({
      data: [
        { userId: user.id, wordId: own.id },
        { userId: user.id, wordId: sysWord.id },
      ],
    });

    const { removedCount } = await removeBookmarksForUser(user.id, {
      kind: "word",
      match: "prefix",
    });

    expect(removedCount).toBe(2);
    expect(await prisma.bookmark.count({ where: { userId: user.id } })).toBe(0);
  });

  test("occurrence ビュー: 掲載番号レンジに一致するブックマークだけを解除する", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "単語帳A");
    const inRange = await createQuizWordRow(user.id, "alpha", {
      occurrence: { id: occ.id, occurrenceNumber: 1 },
    });
    const outOfRange = await createQuizWordRow(user.id, "beta", {
      occurrence: { id: occ.id, occurrenceNumber: 50 },
    });
    const noOccurrence = await createWordRow(user.id, "gamma");
    await prisma.bookmark.createMany({
      data: [inRange, outOfRange, noOccurrence].map((w) => ({ userId: user.id, wordId: w.id })),
    });

    const { removedCount } = await removeBookmarksForUser(user.id, {
      kind: "occurrence",
      occurrenceId: occ.id,
      match: "prefix",
      from: 1,
      to: 10,
    });

    expect(removedCount).toBe(1);
    const remainingIds = (
      await prisma.bookmark.findMany({
        where: { userId: user.id },
        select: { wordId: true },
      })
    )
      .map((r) => r.wordId)
      .sort();
    expect(remainingIds).toEqual([outOfRange.id, noOccurrence.id].sort());
  });

  test("occurrence ビュー: 他ユーザーの occurrenceId では何も解除されない（0 件の正常系）", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const otherOcc = await createOccurrenceRow(other.id, "他人の単語帳");
    await createQuizWordRow(other.id, "alpha", {
      occurrence: { id: otherOcc.id, occurrenceNumber: 1 },
    });
    const own = await createWordRow(user.id, "自前単語");
    await prisma.bookmark.create({ data: { userId: user.id, wordId: own.id } });

    const { removedCount } = await removeBookmarksForUser(user.id, {
      kind: "occurrence",
      occurrenceId: otherOcc.id,
      match: "prefix",
    });

    expect(removedCount).toBe(0);
    expect(await prisma.bookmark.count({ where: { userId: user.id } })).toBe(1);
  });
});
