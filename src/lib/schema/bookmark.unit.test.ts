import { describe, expect, test } from "vitest";

import {
  addBookmarksInputSchema,
  BOOKMARK_WORD_IDS_MAX_COUNT,
  getBookmarkStatesInputSchema,
  removeBookmarksByFilterInputSchema,
} from "@/lib/schema/bookmark";

const wordIds = (n: number) => Array.from({ length: n }, (_, i) => `w_${i}`);

describe("getBookmarkStatesInputSchema", () => {
  test("accepts an empty array and arrays up to the max count", () => {
    expect(getBookmarkStatesInputSchema.safeParse({ wordIds: [] }).success).toBe(true);
    expect(
      getBookmarkStatesInputSchema.safeParse({ wordIds: wordIds(BOOKMARK_WORD_IDS_MAX_COUNT) })
        .success,
    ).toBe(true);
  });

  test("rejects arrays over the max count", () => {
    expect(
      getBookmarkStatesInputSchema.safeParse({ wordIds: wordIds(BOOKMARK_WORD_IDS_MAX_COUNT + 1) })
        .success,
    ).toBe(false);
  });

  test("rejects non-array / non-string element / missing wordIds", () => {
    expect(getBookmarkStatesInputSchema.safeParse({ wordIds: "w_1" }).success).toBe(false);
    expect(getBookmarkStatesInputSchema.safeParse({ wordIds: [1, 2] }).success).toBe(false);
    expect(getBookmarkStatesInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("addBookmarksInputSchema", () => {
  test("rejects an empty array (min(1)) — 0 件登録は呼び出し側のバグ", () => {
    expect(addBookmarksInputSchema.safeParse({ wordIds: [] }).success).toBe(false);
  });

  test("accepts arrays up to the max count and rejects over it", () => {
    expect(addBookmarksInputSchema.safeParse({ wordIds: ["w_1"] }).success).toBe(true);
    expect(
      addBookmarksInputSchema.safeParse({ wordIds: wordIds(BOOKMARK_WORD_IDS_MAX_COUNT) }).success,
    ).toBe(true);
    expect(
      addBookmarksInputSchema.safeParse({ wordIds: wordIds(BOOKMARK_WORD_IDS_MAX_COUNT + 1) })
        .success,
    ).toBe(false);
  });

  test("rejects non-array / non-string element / missing wordIds", () => {
    expect(addBookmarksInputSchema.safeParse({ wordIds: "w_1" }).success).toBe(false);
    expect(addBookmarksInputSchema.safeParse({ wordIds: [1, 2] }).success).toBe(false);
    expect(addBookmarksInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("removeBookmarksByFilterInputSchema", () => {
  test("word ビュー: q 省略・空文字・指定ありを受け付ける", () => {
    expect(
      removeBookmarksByFilterInputSchema.safeParse({ kind: "word", match: "prefix" }).success,
    ).toBe(true);
    expect(
      removeBookmarksByFilterInputSchema.safeParse({ kind: "word", q: "", match: "contains" })
        .success,
    ).toBe(true);
    expect(
      removeBookmarksByFilterInputSchema.safeParse({ kind: "word", q: "app", match: "suffix" })
        .success,
    ).toBe(true);
  });

  test("occurrence ビュー: occurrenceId 必須・範囲は 1 以上の整数のみ", () => {
    expect(
      removeBookmarksByFilterInputSchema.safeParse({
        kind: "occurrence",
        occurrenceId: "occ_1",
        match: "prefix",
        from: 1,
        to: 50,
      }).success,
    ).toBe(true);
    expect(
      removeBookmarksByFilterInputSchema.safeParse({ kind: "occurrence", match: "prefix" }).success,
    ).toBe(false);
    expect(
      removeBookmarksByFilterInputSchema.safeParse({
        kind: "occurrence",
        occurrenceId: "",
        match: "prefix",
      }).success,
    ).toBe(false);
    expect(
      removeBookmarksByFilterInputSchema.safeParse({
        kind: "occurrence",
        occurrenceId: "occ_1",
        match: "prefix",
        from: 0,
      }).success,
    ).toBe(false);
    expect(
      removeBookmarksByFilterInputSchema.safeParse({
        kind: "occurrence",
        occurrenceId: "occ_1",
        match: "prefix",
        to: 1.5,
      }).success,
    ).toBe(false);
  });

  test("不正な kind・match を拒否する", () => {
    expect(
      removeBookmarksByFilterInputSchema.safeParse({ kind: "all", match: "prefix" }).success,
    ).toBe(false);
    expect(
      removeBookmarksByFilterInputSchema.safeParse({ kind: "word", match: "exact" }).success,
    ).toBe(false);
  });
});
