import { describe, expect, test } from "vitest";

import type { WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser } from "@/lib/words-create";
import { searchWordsForLink } from "@/lib/words-search";

import { createTestUser } from "../../tests/setup/fixtures";

function form(headword: string): WordFormValues {
  return {
    headword,
    meanings: [
      {
        partOfSpeech: "",
        pronunciation: "",
        texts: [{ text: "意味" }],
        note: "",
      },
    ],
    examples: [],
    relatedWords: [],
    memos: [],
    occurrences: [],
  };
}

describe("searchWordsForLink", () => {
  test("empty query returns []", async () => {
    const user = await createTestUser();
    expect(await searchWordsForLink(user.id, "")).toEqual([]);
    expect(await searchWordsForLink(user.id, "   ")).toEqual([]);
  });

  test("user matches come before system matches even when alphabetically later", async () => {
    const user = await createTestUser();
    // system word starts with 'a', user word starts with 'z' -- but user should win
    await createWordForUser(SYSTEM_USER_ID, form("auto-sys"));
    await createWordForUser(user.id, form("zuto-user"));
    const results = await searchWordsForLink(user.id, "uto");
    expect(results).toHaveLength(2);
    expect(results[0].headword).toBe("zuto-user");
    expect(results[0].isSystem).toBe(false);
    expect(results[1].headword).toBe("auto-sys");
    expect(results[1].isSystem).toBe(true);
  });

  test("case-insensitive substring match", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, form("UBIQUITOUS"));
    const results = await searchWordsForLink(user.id, "ubi");
    expect(results).toHaveLength(1);
    expect(results[0].headword).toBe("UBIQUITOUS");
  });

  test("limit is clamped to [1, 20]", async () => {
    const user = await createTestUser();
    for (let i = 0; i < 25; i++) {
      await createWordForUser(user.id, form(`match-${i.toString().padStart(2, "0")}`));
    }
    expect(await searchWordsForLink(user.id, "match", 0)).toHaveLength(1);
    expect(await searchWordsForLink(user.id, "match", 100)).toHaveLength(20);
  });

  test("foreign user's words are excluded", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    await createWordForUser(stranger.id, form("strangerword"));
    expect(await searchWordsForLink(user.id, "stranger")).toEqual([]);
  });
});
