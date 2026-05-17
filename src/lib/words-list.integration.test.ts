import { describe, expect, test } from "vitest";

import type { WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser } from "@/lib/words-create";
import { listWordsForUser } from "@/lib/words-list";

import { createTestUser } from "../../tests/setup/fixtures";

function form(headword: string): WordFormValues {
  return {
    headword,
    meanings: [
      {
        partOfSpeech: "n",
        pronunciation: "",
        texts: [{ text: `意味:${headword}` }],
        note: "",
      },
    ],
    examples: [],
    relatedWords: [],
    memos: [],
    occurrences: [],
  };
}

describe("listWordsForUser", () => {
  test("returns user + system words within scope, isSystem flag is set correctly", async () => {
    const user = await createTestUser();
    await createWordForUser(SYSTEM_USER_ID, form("zsystem"));
    await createWordForUser(user.id, form("alpha"));

    const result = await listWordsForUser(user.id, {
      sort: "headword",
      skip: 0,
      take: 50,
    });
    expect(result.total).toBe(2);
    const byHeadword = new Map(result.items.map((i) => [i.headword, i]));
    expect(byHeadword.get("alpha")?.isSystem).toBe(false);
    expect(byHeadword.get("zsystem")?.isSystem).toBe(true);
  });

  test("excludes foreign user's words", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    await createWordForUser(stranger.id, form("secret"));
    await createWordForUser(user.id, form("public"));

    const result = await listWordsForUser(user.id, { sort: "headword", skip: 0, take: 50 });
    expect(result.items.map((i) => i.headword)).toEqual(["public"]);
  });

  test("q filter is case-insensitive (substring match on headword)", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, form("UBIQUITOUS"));
    await createWordForUser(user.id, form("rare"));

    const result = await listWordsForUser(user.id, {
      q: "ubi",
      sort: "headword",
      skip: 0,
      take: 50,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].headword).toBe("UBIQUITOUS");
  });

  test("sort=headword orders ascending; sort=recent orders by createdAt desc", async () => {
    const user = await createTestUser();
    const aId = (await createWordForUser(user.id, form("apple"))).id;
    const bId = (await createWordForUser(user.id, form("banana"))).id;
    const cId = (await createWordForUser(user.id, form("cherry"))).id;

    const byHeadword = await listWordsForUser(user.id, {
      sort: "headword",
      skip: 0,
      take: 50,
    });
    expect(byHeadword.items.map((i) => i.headword)).toEqual(["apple", "banana", "cherry"]);

    const byRecent = await listWordsForUser(user.id, { sort: "recent", skip: 0, take: 50 });
    expect(byRecent.items.map((i) => i.id)).toEqual([cId, bId, aId]);
  });

  test("returns meaningTexts from all texts of the first meaning", async () => {
    const user = await createTestUser();
    const w = await createWordForUser(user.id, form("hello"));
    const result = await listWordsForUser(user.id, { sort: "headword", skip: 0, take: 50 });
    const item = result.items.find((i) => i.id === w.id);
    expect(item?.meaningTexts).toEqual(["意味:hello"]);
    expect(item?.partOfSpeech).toBe("n");
  });
});
