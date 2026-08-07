import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import { type WordFormValues, wordDetailToFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser } from "@/lib/words-create";
import { getWordDetailForUser } from "@/lib/words-detail";
import {
  findAdjacentWordsByOccurrence,
  findAdjacentWordsByOccurrenceNumber,
  listWordsByOccurrence,
  listWordsForUser,
} from "@/lib/words-list";
import { updateWordForUser } from "@/lib/words-update";

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

/** userId が wordId をブックマークする（書き込み UseCase は本チケット対象外のため直接挿入する）。 */
async function bookmarkWord(userId: string, wordId: string): Promise<void> {
  await prisma.bookmark.create({ data: { userId, wordId } });
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

  // #103 回帰: 共有(system)単語に別ユーザーが pass-through で付加した Meaning が sortOrder 先頭に
  // 来ても、meanings の owner 再スコープにより一覧カードへ他人の意味・品詞・音源が漏れないこと。
  test("does not leak a foreign user's meaning sorted first on a shared system word", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const sysWord = await createWordForUser(SYSTEM_USER_ID, form("shared"));

    // stranger が pass-through で自分の Meaning を付加する（末尾 sortOrder に付く）
    const detail = await getWordDetailForUser(stranger.id, sysWord.id);
    const strangerForm = wordDetailToFormValues(detail!);
    strangerForm.meanings.push({
      partOfSpeech: "verb",
      pronunciation: "",
      texts: [{ text: "他人の私的な意味" }],
      notes: [],
    });
    await updateWordForUser(stranger.id, sysWord.id, strangerForm);

    // stranger の Meaning を sortOrder 先頭へ並べ替え、識別用に音源も付ける
    // （並べ替えは pass-through で許される操作。ここでは結果の DB 状態を直接構成する）
    const meanings = await prisma.meaning.findMany({
      where: { wordId: sysWord.id },
      select: { id: true, ownerId: true },
    });
    const systemMeaning = meanings.find((m) => m.ownerId === SYSTEM_USER_ID)!;
    const strangerMeaning = meanings.find((m) => m.ownerId === stranger.id)!;
    await prisma.meaning.update({ where: { id: systemMeaning.id }, data: { sortOrder: 1 } });
    await prisma.meaning.update({
      where: { id: strangerMeaning.id },
      data: { sortOrder: 0, pronunciationAudioUrl: "stranger-audio-key" },
    });

    // 第三者 user から一覧を引くと、見えるのは system Meaning のみで stranger の情報は含まれない
    const result = await listWordsForUser(user.id, {
      sort: "headword",
      match: "contains",
      skip: 0,
      take: 50,
    });
    const item = result.items.find((i) => i.headword === "shared");
    expect(item?.meaningTexts).toEqual(["意味:shared"]);
    expect(item?.partOfSpeech).toBe("noun");
    expect(item?.pronunciationAudioUrl).toBeNull();
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

  test("q filter ignores accent marks (アクセント記号付きのキーワードでも一致する)", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, form("thought"));

    const result = await listWordsForUser(user.id, {
      q: "thóught",
      sort: "headword",
      match: "prefix",
      skip: 0,
      take: 50,
    });
    expect(result.items.map((i) => i.headword)).toEqual(["thought"]);
    expect(result.total).toBe(1);
  });

  test("q がアクセント記号だけなら絞り込み無し（全件一致にならない）", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, form("apple"));
    await createWordForUser(user.id, form("banana"));

    const result = await listWordsForUser(user.id, {
      q: "́",
      sort: "headword",
      match: "prefix",
      skip: 0,
      take: 50,
    });
    expect(result.items.map((i) => i.headword)).toEqual(["apple", "banana"]);
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

  test("bookmarked reflects only the viewing user's bookmark", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const marked = await createWordForUser(user.id, form("marked"));
    // 共有(system)単語を stranger だけがブックマーク。user から見ると false のまま。
    const shared = await createWordForUser(SYSTEM_USER_ID, form("shared"));
    await bookmarkWord(user.id, marked.id);
    await bookmarkWord(stranger.id, shared.id);

    const result = await listWordsForUser(user.id, {
      sort: "headword",
      match: "contains",
      skip: 0,
      take: 50,
    });
    const byHeadword = new Map(result.items.map((i) => [i.headword, i]));
    expect(byHeadword.get("marked")?.bookmarked).toBe(true);
    expect(byHeadword.get("shared")?.bookmarked).toBe(false);
  });

  test("bookmarkedOnly returns only the user's bookmarked words (foreign bookmarks excluded)", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const aaa = await createWordForUser(user.id, form("aaa"));
    const bbb = await createWordForUser(user.id, form("bbb"));
    const ccc = await createWordForUser(SYSTEM_USER_ID, form("ccc"));
    await bookmarkWord(user.id, aaa.id);
    await bookmarkWord(user.id, ccc.id);
    // stranger が bbb をブックマークしても user の絞り込みには混ざらない
    await bookmarkWord(stranger.id, bbb.id);

    const result = await listWordsForUser(user.id, {
      sort: "headword",
      match: "contains",
      bookmarkedOnly: true,
      skip: 0,
      take: 50,
    });
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.headword)).toEqual(["aaa", "ccc"]);
    expect(result.items.every((i) => i.bookmarked)).toBe(true);
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

  test("keyword ignores accent marks (掲載箇所ビューでも同じ正規化が効く)", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, formWithOccurrence("thought", LOC, 1));
    await createWordForUser(user.id, formWithOccurrence("banana", LOC, 2));
    const occurrenceId = await occurrenceIdOf(user.id, LOC);

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      q: "thóught",
      match: "prefix",
      order: "asc",
      skip: 0,
      take: 50,
    });
    expect(result.items.map((i) => i.headword)).toEqual(["thought"]);
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

  test("bookmarked reflects only the viewing user's bookmark", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const alpha = await createWordForUser(user.id, formWithOccurrence("alpha", LOC, 1));
    const bravo = await createWordForUser(user.id, formWithOccurrence("bravo", LOC, 2));
    const occurrenceId = await occurrenceIdOf(user.id, LOC);
    await bookmarkWord(user.id, alpha.id);
    // stranger のブックマークは user の一覧に混ざらない
    await bookmarkWord(stranger.id, bravo.id);

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      match: "contains",
      order: "asc",
      skip: 0,
      take: 50,
    });
    const byHeadword = new Map(result.items.map((i) => [i.headword, i]));
    expect(byHeadword.get("alpha")?.bookmarked).toBe(true);
    expect(byHeadword.get("bravo")?.bookmarked).toBe(false);
  });

  test("bookmarkedOnly filters within the occurrence (foreign bookmarks excluded)", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const alpha = await createWordForUser(user.id, formWithOccurrence("alpha", LOC, 1));
    const bravo = await createWordForUser(user.id, formWithOccurrence("bravo", LOC, 2));
    const charlie = await createWordForUser(user.id, formWithOccurrence("charlie", LOC, 3));
    const occurrenceId = await occurrenceIdOf(user.id, LOC);
    await bookmarkWord(user.id, alpha.id);
    await bookmarkWord(user.id, charlie.id);
    // stranger が bravo をブックマークしても絞り込みには混ざらない
    await bookmarkWord(stranger.id, bravo.id);

    const result = await listWordsByOccurrence(user.id, {
      occurrenceId,
      match: "contains",
      order: "asc",
      bookmarkedOnly: true,
      skip: 0,
      take: 50,
    });
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.headword)).toEqual(["alpha", "charlie"]);
    expect(result.items.every((i) => i.bookmarked)).toBe(true);
  });
});

describe("findAdjacentWordsByOccurrence", () => {
  const LOC = "Book";
  const base = { match: "contains" as const, order: "asc" as const };

  /** alpha#1 / bravo#5 / charlie#10 / delta#null を登録して各 id と掲載箇所 id を返す。 */
  async function seedWords(userId: string) {
    const alpha = await createWordForUser(userId, formWithOccurrence("alpha", LOC, 1));
    const bravo = await createWordForUser(userId, formWithOccurrence("bravo", LOC, 5));
    const charlie = await createWordForUser(userId, formWithOccurrence("charlie", LOC, 10));
    const delta = await createWordForUser(userId, formWithOccurrence("delta", LOC, null));
    const occurrenceId = await occurrenceIdOf(userId, LOC);
    return { alpha, bravo, charlie, delta, occurrenceId };
  }

  test("middle word: prev/next follow occurrenceNumber order", async () => {
    const user = await createTestUser();
    const { bravo, occurrenceId } = await seedWords(user.id);

    const nav = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: bravo.id,
      ...base,
    });
    expect(nav?.current.occurrenceNumber).toBe(5);
    expect(nav?.prev?.headword).toBe("alpha");
    expect(nav?.next?.headword).toBe("charlie");
  });

  test("edges: first has no prev, last (null number) has no next", async () => {
    const user = await createTestUser();
    const { alpha, delta, occurrenceId } = await seedWords(user.id);

    const first = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: alpha.id,
      ...base,
    });
    expect(first?.prev).toBeNull();
    expect(first?.next?.headword).toBe("bravo");

    const last = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: delta.id,
      ...base,
    });
    expect(last?.current.occurrenceNumber).toBeNull();
    expect(last?.next).toBeNull();
  });

  test("null numbers: bridges numbered <-> null and orders nulls by headword", async () => {
    const user = await createTestUser();
    const { charlie, delta, occurrenceId } = await seedWords(user.id);
    const echo = await createWordForUser(user.id, formWithOccurrence("echo", LOC, null));

    // 最後の番号付き → 最初の null（見出し語昇順）
    const fromNumbered = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: charlie.id,
      ...base,
    });
    expect(fromNumbered?.next?.headword).toBe("delta");

    // null 同士は見出し語順、null の prev は最後の番号付きへ戻る
    const atNull = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: delta.id,
      ...base,
    });
    expect(atNull?.prev?.headword).toBe("charlie");
    expect(atNull?.next?.headword).toBe("echo");

    const atLastNull = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: echo.id,
      ...base,
    });
    expect(atLastNull?.prev?.headword).toBe("delta");
    expect(atLastNull?.next).toBeNull();
  });

  test("order=desc reverses direction, null still last", async () => {
    const user = await createTestUser();
    const { alpha, bravo, charlie, delta, occurrenceId } = await seedWords(user.id);
    const desc = { match: "contains" as const, order: "desc" as const };

    // desc の一覧順: charlie(10), bravo(5), alpha(1), delta(null)
    const first = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: charlie.id,
      ...desc,
    });
    expect(first?.prev).toBeNull();
    expect(first?.next?.headword).toBe("bravo");

    const mid = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: bravo.id,
      ...desc,
    });
    expect(mid?.prev?.headword).toBe("charlie");
    expect(mid?.next?.headword).toBe("alpha");

    const lastNumbered = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: alpha.id,
      ...desc,
    });
    expect(lastNumbered?.next?.headword).toBe("delta");

    const atNull = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: delta.id,
      ...desc,
    });
    expect(atNull?.prev?.headword).toBe("alpha");
    expect(atNull?.next).toBeNull();
  });

  test("q filter: skips non-matching words; current not matching -> null", async () => {
    const user = await createTestUser();
    const apple = await createWordForUser(user.id, formWithOccurrence("apple", LOC, 1));
    const apricot = await createWordForUser(user.id, formWithOccurrence("apricot", LOC, 2));
    const banana = await createWordForUser(user.id, formWithOccurrence("banana", LOC, 3));
    await createWordForUser(user.id, formWithOccurrence("avocado", LOC, 4));
    const occurrenceId = await occurrenceIdOf(user.id, LOC);
    const withQ = { q: "a", match: "prefix" as const, order: "asc" as const };

    const nav = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: apricot.id,
      ...withQ,
    });
    expect(nav?.prev?.headword).toBe("apple");
    // banana(#3) は q に不一致なので飛ばして avocado(#4)
    expect(nav?.next?.headword).toBe("avocado");

    const notMatching = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: banana.id,
      ...withQ,
    });
    expect(notMatching).toBeNull();

    const first = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: apple.id,
      ...withQ,
    });
    expect(first?.prev).toBeNull();
  });

  test("range: excludes out-of-range and null; current out of range -> null", async () => {
    const user = await createTestUser();
    const { alpha, bravo, charlie, occurrenceId } = await seedWords(user.id);
    const ranged = { match: "contains" as const, order: "asc" as const, from: 2, to: 10 };

    const first = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: bravo.id,
      ...ranged,
    });
    // alpha(#1) は範囲外
    expect(first?.prev).toBeNull();
    expect(first?.next?.headword).toBe("charlie");

    const last = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: charlie.id,
      ...ranged,
    });
    // delta(null) は範囲指定で除外
    expect(last?.next).toBeNull();

    const outOfRange = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: alpha.id,
      ...ranged,
    });
    expect(outOfRange).toBeNull();
  });

  test("scope: mixes own + system words in a system occurrence, excludes other users", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    await createWordForUser(SYSTEM_USER_ID, formWithOccurrence("sysone", LOC, 1));
    const sysThree = await createWordForUser(
      SYSTEM_USER_ID,
      formWithOccurrence("systhree", LOC, 3),
    );
    // location 一致で SYSTEM 掲載箇所へ紐付く（共通掲載箇所では一般ユーザーの番号は強制 null）
    const mine = await createWordForUser(user.id, formWithOccurrence("minetwo", LOC, 2));
    const strangerWord = await createWordForUser(
      stranger.id,
      formWithOccurrence("strangerfour", LOC, null),
    );
    // 番号付きの他ユーザー行は通常パスでは作れないため、スコープ除外の検証用に直接セットする
    await prisma.wordOccurrence.updateMany({
      where: { wordId: strangerWord.id },
      data: { occurrenceNumber: 4 },
    });
    const occurrenceId = await occurrenceIdOf(SYSTEM_USER_ID, LOC);

    // 自分の単語は番号 null → null グループ（末尾）に入り、prev は最後の番号付き（SYSTEM）
    const nav = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: mine.id,
      ...base,
    });
    expect(nav?.current.occurrenceNumber).toBeNull();
    expect(nav?.prev?.headword).toBe("systhree");
    expect(nav?.next).toBeNull();

    // 他ユーザーの #4 はスコープ外なので、#3 の次はスコープ内 null グループの先頭（自分の単語）
    const atSysThree = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: sysThree.id,
      ...base,
    });
    expect(atSysThree?.next?.headword).toBe("minetwo");
  });

  test("bookmarkedOnly: prev/next follow only bookmarked words", async () => {
    const user = await createTestUser();
    const { alpha, bravo, delta, occurrenceId } = await seedWords(user.id);
    await bookmarkWord(user.id, alpha.id);
    await bookmarkWord(user.id, bravo.id);
    // charlie(#10) はブックマーク外 → 飛ばして delta(null)
    await bookmarkWord(user.id, delta.id);

    const nav = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: bravo.id,
      ...base,
      bookmarkedOnly: true,
    });
    expect(nav?.prev?.headword).toBe("alpha");
    expect(nav?.next?.headword).toBe("delta");
  });

  test("bookmarkedOnly: current not bookmarked -> null", async () => {
    const user = await createTestUser();
    const { alpha, bravo, occurrenceId } = await seedWords(user.id);
    await bookmarkWord(user.id, alpha.id);

    const nav = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: bravo.id,
      ...base,
      bookmarkedOnly: true,
    });
    expect(nav).toBeNull();
  });

  test("word not in the occurrence -> null", async () => {
    const user = await createTestUser();
    const { occurrenceId } = await seedWords(user.id);
    const plain = await createWordForUser(user.id, form("plain"));

    const nav = await findAdjacentWordsByOccurrence(user.id, {
      occurrenceId,
      wordId: plain.id,
      ...base,
    });
    expect(nav).toBeNull();
  });
});

describe("findAdjacentWordsByOccurrenceNumber", () => {
  const LOC = "Book";

  test("ascending by number with edges", async () => {
    const user = await createTestUser();
    const one = await createWordForUser(user.id, formWithOccurrence("one", LOC, 1));
    const three = await createWordForUser(user.id, formWithOccurrence("three", LOC, 3));
    const five = await createWordForUser(user.id, formWithOccurrence("five", LOC, 5));
    const occurrenceId = await occurrenceIdOf(user.id, LOC);

    const mid = await findAdjacentWordsByOccurrenceNumber(user.id, occurrenceId, three.id);
    expect(mid?.current.occurrenceNumber).toBe(3);
    expect(mid?.prev?.headword).toBe("one");
    expect(mid?.next?.headword).toBe("five");

    const first = await findAdjacentWordsByOccurrenceNumber(user.id, occurrenceId, one.id);
    expect(first?.prev).toBeNull();

    const last = await findAdjacentWordsByOccurrenceNumber(user.id, occurrenceId, five.id);
    expect(last?.next).toBeNull();
  });

  test("current word without number -> null (not navigable)", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, formWithOccurrence("one", LOC, 1));
    const noNumber = await createWordForUser(user.id, formWithOccurrence("nonum", LOC, null));
    const occurrenceId = await occurrenceIdOf(user.id, LOC);

    const nav = await findAdjacentWordsByOccurrenceNumber(user.id, occurrenceId, noNumber.id);
    expect(nav).toBeNull();
  });

  test("null-numbered words never appear as prev/next", async () => {
    const user = await createTestUser();
    const one = await createWordForUser(user.id, formWithOccurrence("one", LOC, 1));
    await createWordForUser(user.id, formWithOccurrence("nonum", LOC, null));
    const three = await createWordForUser(user.id, formWithOccurrence("three", LOC, 3));
    const occurrenceId = await occurrenceIdOf(user.id, LOC);

    const nav = await findAdjacentWordsByOccurrenceNumber(user.id, occurrenceId, one.id);
    expect(nav?.next?.headword).toBe("three");
    const back = await findAdjacentWordsByOccurrenceNumber(user.id, occurrenceId, three.id);
    expect(back?.prev?.headword).toBe("one");
  });

  test("excludes other users' words within the same system occurrence", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const sysOne = await createWordForUser(SYSTEM_USER_ID, formWithOccurrence("sysone", LOC, 1));
    await createWordForUser(SYSTEM_USER_ID, formWithOccurrence("systhree", LOC, 3));
    const strangerWord = await createWordForUser(
      stranger.id,
      formWithOccurrence("strangertwo", LOC, null),
    );
    // 番号付きの他ユーザー行は通常パスでは作れないため、スコープ除外の検証用に直接セットする
    await prisma.wordOccurrence.updateMany({
      where: { wordId: strangerWord.id },
      data: { occurrenceNumber: 2 },
    });
    const occurrenceId = await occurrenceIdOf(SYSTEM_USER_ID, LOC);

    const nav = await findAdjacentWordsByOccurrenceNumber(user.id, occurrenceId, sysOne.id);
    // 他ユーザーの #2 はスコープ外なので #1 の次は #3
    expect(nav?.next?.headword).toBe("systhree");
  });
});
