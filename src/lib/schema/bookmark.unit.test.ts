import { describe, expect, test } from "vitest";

import { BOOKMARK_WORD_IDS_MAX_COUNT, getBookmarkStatesInputSchema } from "@/lib/schema/bookmark";

describe("getBookmarkStatesInputSchema", () => {
  const wordIds = (n: number) => Array.from({ length: n }, (_, i) => `w_${i}`);

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
