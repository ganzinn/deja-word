import { describe, expect, test } from "vitest";

import {
  BookmarkWordNotInScopeError,
  getBookmarkedWordIdsForUser,
  setBookmarkForUser,
} from "@/lib/bookmark-settings";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createTestUser, createWordRow } from "../../tests/setup/fixtures";

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
