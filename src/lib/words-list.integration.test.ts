import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import type { WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser } from "@/lib/words-create";
import { listWordsByOccurrence, listWordsForUser } from "@/lib/words-list";

import { createTestUser } from "../../tests/setup/fixtures";

function form(headword: string): WordFormValues {
  return {
    headword,
    meanings: [
      {
        partOfSpeech: "noun",
        pronunciation: "",
        texts: [{ text: `意味:${headword}` }],
        notes: [],
      },
    ],
    examples: [],
    relatedWords: [],
    memos: [],
    occurrences: [],
  };
}

/** location の掲載箇所に occurrenceNumber 付きで登録する単語フォーム。 */
function formWithOccurrence(
  headword: string,
  location: string,
  occurrenceNumber: number | null,
): WordFormValues {
  return {
    ...form(headword),
    occurrences: [{ ownerId: "", location, occurrenceNumber, details: [] }],
  };
}

/** 複数の意味を持つ単語フォーム（先頭意味選択の検証用）。 */
function formWithMeanings(headword: string, count: number): WordFormValues {
  return {
    ...form(headword),
    meanings: Array.from({ length: count }, (_, i) => ({
      partOfSpeech: "noun",
      pronunciation: "",
      texts: [{ text: `意味${i + 1}:${headword}` }],
      notes: [],
    })),
  };
}

/**
 * 単語の意味（sortOrder 昇順）に発音音源 URL を直接セットする。
 * 音源 URL はフォーム作成では永続化されず専用 Action で設定されるため、テストでは直接書き込む。
 */
async function setMeaningAudios(wordId: string, urls: (string | null)[]): Promise<void> {
  const meanings = await prisma.meaning.findMany({
    where: { wordId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  for (const [i, url] of urls.entries()) {
    await prisma.meaning.update({
      where: { id: meanings[i].id },
      data: { pronunciationAudioUrl: url },
    });
  }
}

/** create 時に find-or-create された掲載箇所の id を取得する。 */
async function occurrenceIdOf(userId: string, location: string): Promise<string> {
  const occ = await prisma.occurrence.findFirstOrThrow({
    where: { ownerId: userId, location },
    select: { id: true },
  });
  return occ.id;
}

describe("listWordsForUser", () => {
  test("returns user + system words within scope, isSystem flag is set correctly", async () => {
    const user = await createTestUser();
    await createWordForUser(SYSTEM_USER_ID, form("zsystem"));
    await createWordForUser(user.id, form("alpha"));

    const result = await listWordsForUser(user.id, {
      sort: "headword",
      match: "contains",
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

    const result = await listWordsForUser(user.id, {
      sort: "headword",
      match: "contains",
      skip: 0,
      take: 50,
    });
    expect(result.items.map((i) => i.headword)).toEqual(["public"]);
  });

  test("q filter is case-insensitive (substring match on headword)", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, form("UBIQUITOUS"));
    await createWordForUser(user.id, form("rare"));

    const result = await listWordsForUser(user.id, {
      q: "uito",
      sort: "headword",
      match: "contains",
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
      match: "contains",
      skip: 0,
      take: 50,
    });
    expect(byHeadword.items.map((i) => i.headword)).toEqual(["apple", "banana", "cherry"]);

    const byRecent = await listWordsForUser(user.id, {
      sort: "recent",
      match: "contains",
      skip: 0,
      take: 50,
    });
    expect(byRecent.items.map((i) => i.id)).toEqual([cId, bId, aId]);
  });

  test("match mode: prefix / contains / suffix filter headword accordingly", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, form("apple"));
    await createWordForUser(user.id, form("pineapple"));
    await createWordForUser(user.id, form("grape"));

    const prefix = await listWordsForUser(user.id, {
      q: "apple",
      sort: "headword",
      match: "prefix",
      skip: 0,
      take: 50,
    });
    expect(prefix.items.map((i) => i.headword)).toEqual(["apple"]);

    const contains = await listWordsForUser(user.id, {
      q: "apple",
      sort: "headword",
      match: "contains",
      skip: 0,
      take: 50,
    });
    expect(contains.items.map((i) => i.headword)).toEqual(["apple", "pineapple"]);

    const suffix = await listWordsForUser(user.id, {
      q: "apple",
      sort: "headword",
      match: "suffix",
      skip: 0,
      take: 50,
    });
    expect(suffix.items.map((i) => i.headword)).toEqual(["apple", "pineapple"]);
  });

  test("match=prefix is case-insensitive", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, form("Ubiquitous"));

    const result = await listWordsForUser(user.id, {
      q: "ubi",
      sort: "headword",
      match: "prefix",
      skip: 0,
      take: 50,
    });
    expect(result.items.map((i) => i.headword)).toEqual(["Ubiquitous"]);
  });

  test("returns meaningTexts from all texts of the first meaning", async () => {
    const user = await createTestUser();
    const w = await createWordForUser(user.id, form("hello"));
    const result = await listWordsForUser(user.id, {
      sort: "headword",
      match: "contains",
      skip: 0,
      take: 50,
    });
    const item = result.items.find((i) => i.id === w.id);
    expect(item?.meaningTexts).toEqual(["意味:hello"]);
    expect(item?.partOfSpeech).toBe("noun");
  });

  test("returns pronunciationAudioUrl of the first meaning", async () => {
    const user = await createTestUser();
    const w = await createWordForUser(user.id, form("hello"));
    await setMeaningAudios(w.id, ["/api/dev-blob/audio/meaning/m/pronunciation.mp3"]);
    const result = await listWordsForUser(user.id, {
      sort: "headword",
      match: "contains",
      skip: 0,
      take: 50,
    });
    const item = result.items.find((i) => i.id === w.id);
    expect(item?.pronunciationAudioUrl).toBe("/api/dev-blob/audio/meaning/m/pronunciation.mp3");
  });

  test("pronunciationAudioUrl is null when the first meaning has no audio", async () => {
    const user = await createTestUser();
    const w = await createWordForUser(user.id, form("hello"));
    const result = await listWordsForUser(user.id, {
      sort: "headword",
      match: "contains",
      skip: 0,
      take: 50,
    });
    const item = result.items.find((i) => i.id === w.id);
    expect(item?.pronunciationAudioUrl).toBeNull();
  });

  test("uses the first meaning's audio, not later meanings", async () => {
    const user = await createTestUser();
    const w = await createWordForUser(user.id, formWithMeanings("hello", 2));
    await setMeaningAudios(w.id, ["/audio/first.mp3", "/audio/second.mp3"]);
    const result = await listWordsForUser(user.id, {
      sort: "headword",
      match: "contains",
      skip: 0,
      take: 50,
    });
    const item = result.items.find((i) => i.id === w.id);
    expect(item?.pronunciationAudioUrl).toBe("/audio/first.mp3");
  });
});

describe("listWordsByOccurrence", () => {
  const LOC = "Book";

  async function seed(userId: string) {
    await createWordForUser(userId, formWithOccurrence("alpha", LOC, 1));
    await createWordForUser(userId, formWithOccurrence("bravo", LOC, 5));
    await createWordForUser(userId, formWithOccurrence("charlie", LOC, 10));
    await createWordForUser(userId, formWithOccurrence("delta", LOC, null));
    return occurrenceIdOf(userId, LOC);
  }

  test("range excludes out-of-range numbers and null", async () => {
    const user = await createTestUser();
    const occurrenceId = await seed(user.id);

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      match: "contains",
      from: 2,
      to: 8,
      order: "asc",
      skip: 0,
      take: 50,
    });
    expect(result.total).toBe(1);
    expect(result.items.map((i) => i.headword)).toEqual(["bravo"]);
    expect(result.items[0].occurrenceNumber).toBe(5);
  });

  test("one-sided range (from only) keeps numbers >= from, excludes null", async () => {
    const user = await createTestUser();
    const occurrenceId = await seed(user.id);

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      match: "contains",
      from: 5,
      order: "asc",
      skip: 0,
      take: 50,
    });
    expect(result.items.map((i) => i.headword)).toEqual(["bravo", "charlie"]);
  });

  test("no range: numbers ascending, null last", async () => {
    const user = await createTestUser();
    const occurrenceId = await seed(user.id);

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      match: "contains",
      order: "asc",
      skip: 0,
      take: 50,
    });
    expect(result.total).toBe(4);
    expect(result.items.map((i) => i.headword)).toEqual(["alpha", "bravo", "charlie", "delta"]);
    expect(result.items.at(-1)?.occurrenceNumber).toBeNull();
  });

  test("order desc: numbers descending, null still last", async () => {
    const user = await createTestUser();
    const occurrenceId = await seed(user.id);

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      match: "contains",
      order: "desc",
      skip: 0,
      take: 50,
    });
    expect(result.items.map((i) => i.headword)).toEqual(["charlie", "bravo", "alpha", "delta"]);
  });

  test("keyword (prefix) filters within the occurrence", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, formWithOccurrence("apple", LOC, 1));
    await createWordForUser(user.id, formWithOccurrence("apricot", LOC, 2));
    await createWordForUser(user.id, formWithOccurrence("banana", LOC, 3));
    const occurrenceId = await occurrenceIdOf(user.id, LOC);

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      q: "ap",
      match: "prefix",
      order: "asc",
      skip: 0,
      take: 50,
    });
    expect(result.items.map((i) => i.headword)).toEqual(["apple", "apricot"]);
  });

  test("scoped to the given occurrence only (other occurrence / other user excluded)", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const occurrenceId = await seed(user.id);

    // 別の掲載箇所の単語
    await createWordForUser(user.id, formWithOccurrence("otherloc", "Magazine", 1));
    // 他ユーザーが同名 location（別 owner = 別 occurrence）に登録
    await createWordForUser(stranger.id, formWithOccurrence("stranger", LOC, 1));

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      match: "contains",
      order: "asc",
      skip: 0,
      take: 50,
    });
    expect(result.items.map((i) => i.headword)).toEqual(["alpha", "bravo", "charlie", "delta"]);
  });

  test("carries the first meaning's pronunciationAudioUrl", async () => {
    const user = await createTestUser();
    const w = await createWordForUser(user.id, formWithOccurrence("audible", LOC, 1));
    await setMeaningAudios(w.id, ["/audio/occ.mp3"]);
    const occurrenceId = await occurrenceIdOf(user.id, LOC);

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      match: "contains",
      order: "asc",
      skip: 0,
      take: 50,
    });
    const item = result.items.find((i) => i.id === w.id);
    expect(item?.pronunciationAudioUrl).toBe("/audio/occ.mp3");
  });
});
