import { describe, expect, test } from "vitest";

import {
  buildNewWordHref,
  buildWordDetailHref,
  buildWordEditHref,
  buildWordsHref,
  parseMatch,
  parseOrder,
  parsePage,
  parsePrefillHeadword,
  parseRangeNumber,
  parseSort,
  parseWordDetailNavContext,
  parseWordListContext,
  parseWordListReturnHref,
} from "./search-params";

describe("parseMatch", () => {
  test("accepts contains / suffix, falls back to prefix otherwise", () => {
    expect(parseMatch("contains")).toBe("contains");
    expect(parseMatch("suffix")).toBe("suffix");
    expect(parseMatch("prefix")).toBe("prefix");
    expect(parseMatch("bogus")).toBe("prefix");
    expect(parseMatch(undefined)).toBe("prefix");
  });
});

describe("parseRangeNumber", () => {
  test("accepts integers >= 1", () => {
    expect(parseRangeNumber("1")).toBe(1);
    expect(parseRangeNumber("100")).toBe(100);
  });

  test("rejects zero, negatives, and non-numbers as undefined", () => {
    expect(parseRangeNumber("0")).toBeUndefined();
    expect(parseRangeNumber("-3")).toBeUndefined();
    expect(parseRangeNumber("abc")).toBeUndefined();
    expect(parseRangeNumber("")).toBeUndefined();
    expect(parseRangeNumber(undefined)).toBeUndefined();
  });
});

describe("parseOrder", () => {
  test("accepts desc, falls back to asc otherwise", () => {
    expect(parseOrder("desc")).toBe("desc");
    expect(parseOrder("asc")).toBe("asc");
    expect(parseOrder("bogus")).toBe("asc");
    expect(parseOrder(undefined)).toBe("asc");
  });
});

describe("parseSort", () => {
  test("accepts headword, falls back to recent otherwise", () => {
    expect(parseSort("headword")).toBe("headword");
    expect(parseSort("recent")).toBe("recent");
    expect(parseSort("bogus")).toBe("recent");
    expect(parseSort(undefined)).toBe("recent");
  });
});

describe("parsePage", () => {
  test("accepts integers >= 1", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("42")).toBe(42);
  });

  test("falls back to 1 for zero, negatives, and non-numbers", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });
});

describe("buildWordsHref", () => {
  test("omits all defaults (word view, page 1)", () => {
    expect(buildWordsHref("word", { page: 1 })).toBe("/words");
    expect(buildWordsHref("word", { q: "", sort: "recent", match: "prefix", page: 1 })).toBe(
      "/words",
    );
  });

  test("includes non-default values only", () => {
    expect(
      buildWordsHref("occurrence", {
        occ: "occ1",
        q: "ap",
        match: "contains",
        from: "2",
        to: "8",
        order: "desc",
        page: 3,
      }),
    ).toBe("/words?view=occurrence&occ=occ1&q=ap&match=contains&from=2&to=8&order=desc&page=3");
  });

  test("omits bookmarked when false, includes bookmarked=1 when true", () => {
    expect(buildWordsHref("word", { bookmarked: false, page: 1 })).toBe("/words");
    expect(buildWordsHref("word", { bookmarked: true, page: 1 })).toBe("/words?bookmarked=1");
  });
});

describe("parseWordDetailNavContext", () => {
  test("returns null without occ / view=word", () => {
    expect(parseWordDetailNavContext({})).toBeNull();
    expect(parseWordDetailNavContext({ q: "ap", order: "desc" })).toBeNull();
    // view=word 以外の view 値はコンテキストにならない
    expect(parseWordDetailNavContext({ view: "occurrence" })).toBeNull();
    expect(parseWordDetailNavContext({ view: "bogus", sort: "headword" })).toBeNull();
  });

  test("判別順: occ があれば view=word が同時に付いていても掲載箇所コンテキスト", () => {
    expect(parseWordDetailNavContext({ occ: "occ1", view: "word" })?.kind).toBe("occurrence");
    expect(parseWordDetailNavContext({ occ: "occ1" })?.kind).toBe("occurrence");
    expect(parseWordDetailNavContext({ view: "word" })?.kind).toBe("word");
  });

  test("occurrence: normalizes invalid values and trims q", () => {
    expect(
      parseWordDetailNavContext({ occ: "occ1", q: "  ap  ", match: "bogus", order: "bogus" }),
    ).toEqual({
      kind: "occurrence",
      occ: "occ1",
      q: "ap",
      match: "prefix",
      from: undefined,
      to: undefined,
      order: "asc",
      bookmarked: false,
    });
  });

  test("occurrence: keeps range values raw", () => {
    expect(parseWordDetailNavContext({ occ: "occ1", from: "2", to: "8", order: "desc" })).toEqual({
      kind: "occurrence",
      occ: "occ1",
      q: "",
      match: "prefix",
      from: "2",
      to: "8",
      order: "desc",
      bookmarked: false,
    });
  });

  test("occurrence: bookmarked は '1' のみ true、その他・未指定は false", () => {
    expect(parseWordDetailNavContext({ occ: "occ1", bookmarked: "1" })?.bookmarked).toBe(true);
    expect(parseWordDetailNavContext({ occ: "occ1", bookmarked: "0" })?.bookmarked).toBe(false);
    expect(parseWordDetailNavContext({ occ: "occ1", bookmarked: "true" })?.bookmarked).toBe(false);
    expect(parseWordDetailNavContext({ occ: "occ1" })?.bookmarked).toBe(false);
  });

  test("word: normalizes invalid values and trims q", () => {
    expect(
      parseWordDetailNavContext({ view: "word", q: "  re  ", match: "bogus", sort: "bogus" }),
    ).toEqual({
      kind: "word",
      sort: "recent",
      q: "re",
      match: "prefix",
      bookmarked: false,
    });
  });

  test("word: sort は headword のみ採用、それ以外は recent", () => {
    expect(parseWordDetailNavContext({ view: "word", sort: "headword" })).toMatchObject({
      sort: "headword",
    });
    expect(parseWordDetailNavContext({ view: "word", sort: "recent" })).toMatchObject({
      sort: "recent",
    });
    expect(parseWordDetailNavContext({ view: "word" })).toMatchObject({ sort: "recent" });
  });

  test("word: bookmarked は '1' のみ true、その他・未指定は false", () => {
    expect(parseWordDetailNavContext({ view: "word", bookmarked: "1" })?.bookmarked).toBe(true);
    expect(parseWordDetailNavContext({ view: "word", bookmarked: "0" })?.bookmarked).toBe(false);
    expect(parseWordDetailNavContext({ view: "word" })?.bookmarked).toBe(false);
  });
});

describe("buildWordEditHref", () => {
  test("carries the filter context into the edit URL", () => {
    expect(
      buildWordEditHref("w1", {
        kind: "occurrence",
        occ: "occ1",
        q: "ap",
        match: "suffix",
        from: "2",
        to: "8",
        order: "desc",
        bookmarked: false,
      }),
    ).toBe("/words/w1/edit?occ=occ1&q=ap&match=suffix&from=2&to=8&order=desc");
  });

  test("omits defaults", () => {
    expect(
      buildWordEditHref("w1", {
        kind: "occurrence",
        occ: "occ1",
        q: "",
        match: "prefix",
        order: "asc",
        bookmarked: false,
      }),
    ).toBe("/words/w1/edit?occ=occ1");
  });

  test("includes bookmarked=1 when true", () => {
    expect(
      buildWordEditHref("w1", {
        kind: "occurrence",
        occ: "occ1",
        match: "prefix",
        order: "asc",
        bookmarked: true,
      }),
    ).toBe("/words/w1/edit?occ=occ1&bookmarked=1");
  });

  test("word: carries view=word and the filter context", () => {
    expect(
      buildWordEditHref("w1", {
        kind: "word",
        sort: "headword",
        q: "re",
        match: "contains",
        bookmarked: true,
      }),
    ).toBe("/words/w1/edit?view=word&q=re&match=contains&sort=headword&bookmarked=1");
  });

  test("word: omits defaults (view=word only)", () => {
    expect(
      buildWordEditHref("w1", { kind: "word", sort: "recent", match: "prefix", bookmarked: false }),
    ).toBe("/words/w1/edit?view=word");
  });
});

describe("buildWordDetailHref", () => {
  test("occurrence: always carries occ, omits defaults", () => {
    expect(
      buildWordDetailHref("w1", {
        kind: "occurrence",
        occ: "occ1",
        match: "prefix",
        order: "asc",
        bookmarked: false,
      }),
    ).toBe("/words/w1?occ=occ1");
  });

  test("occurrence: includes non-default filter values", () => {
    expect(
      buildWordDetailHref("w1", {
        kind: "occurrence",
        occ: "occ1",
        q: "ap",
        match: "suffix",
        from: "2",
        to: "8",
        order: "desc",
        bookmarked: false,
      }),
    ).toBe("/words/w1?occ=occ1&q=ap&match=suffix&from=2&to=8&order=desc");
  });

  test("occurrence: includes bookmarked=1 when true", () => {
    expect(
      buildWordDetailHref("w1", {
        kind: "occurrence",
        occ: "occ1",
        match: "prefix",
        order: "asc",
        bookmarked: true,
      }),
    ).toBe("/words/w1?occ=occ1&bookmarked=1");
  });

  test("word: always carries view=word, omits defaults", () => {
    expect(
      buildWordDetailHref("w1", {
        kind: "word",
        sort: "recent",
        q: "",
        match: "prefix",
        bookmarked: false,
      }),
    ).toBe("/words/w1?view=word");
  });

  test("word: includes non-default filter values", () => {
    expect(
      buildWordDetailHref("w1", {
        kind: "word",
        sort: "headword",
        q: "re",
        match: "suffix",
        bookmarked: true,
      }),
    ).toBe("/words/w1?view=word&q=re&match=suffix&sort=headword&bookmarked=1");
  });
});

describe("parseWordListContext", () => {
  test("normalizes invalid values and trims q", () => {
    expect(
      parseWordListContext({
        q: "  ap  ",
        sort: "bogus",
        match: "bogus",
        bookmarked: "true",
        page: "0",
      }),
    ).toEqual({ q: "ap", sort: "recent", match: "prefix", bookmarked: false, page: 1 });
  });

  test("keeps valid values", () => {
    expect(
      parseWordListContext({
        q: "run",
        sort: "headword",
        match: "contains",
        bookmarked: "1",
        page: "2",
      }),
    ).toEqual({ q: "run", sort: "headword", match: "contains", bookmarked: true, page: 2 });
  });

  test("defaults when nothing is given", () => {
    expect(parseWordListContext({})).toEqual({
      q: "",
      sort: "recent",
      match: "prefix",
      bookmarked: false,
      page: 1,
    });
  });
});

describe("buildNewWordHref", () => {
  test("omits all defaults (page 1)", () => {
    expect(
      buildNewWordHref({ q: "", sort: "recent", match: "prefix", bookmarked: false, page: 1 }),
    ).toBe("/words/new");
  });

  test("includes non-default values only", () => {
    expect(
      buildNewWordHref({
        q: "ap",
        sort: "headword",
        match: "contains",
        bookmarked: false,
        page: 3,
      }),
    ).toBe("/words/new?q=ap&match=contains&sort=headword&page=3");
  });

  test("omits bookmarked when false, includes bookmarked=1 when true", () => {
    expect(
      buildNewWordHref({ q: "ap", sort: "recent", match: "prefix", bookmarked: true, page: 1 }),
    ).toBe("/words/new?q=ap&bookmarked=1");
  });
});

describe("parsePrefillHeadword", () => {
  test("strips accents and trims, preserving case", () => {
    expect(parsePrefillHeadword("  RUN  ")).toBe("RUN");
    expect(parsePrefillHeadword("péssimist")).toBe("pessimist");
    // 分解済み（e + 結合アクセント）でも同じ結果になる
    expect(parsePrefillHeadword("péssimist")).toBe("pessimist");
  });

  test("returns null when the normalized keyword fails headwordSchema", () => {
    expect(parsePrefillHeadword(undefined)).toBeNull();
    expect(parsePrefillHeadword("")).toBeNull();
    expect(parsePrefillHeadword("   ")).toBeNull();
    expect(parsePrefillHeadword("a".repeat(101))).toBeNull();
  });

  test("accepts the maximum length", () => {
    expect(parsePrefillHeadword("a".repeat(100))).toBe("a".repeat(100));
  });
});

describe("parseWordListReturnHref", () => {
  test("returns null without a search keyword", () => {
    expect(parseWordListReturnHref({})).toBeNull();
    expect(parseWordListReturnHref({ q: "   ", sort: "headword", page: "2" })).toBeNull();
  });

  test("rebuilds the word view list URL from the context", () => {
    expect(
      parseWordListReturnHref({
        q: "  ap  ",
        sort: "headword",
        match: "contains",
        bookmarked: "1",
        page: "2",
      }),
    ).toBe("/words?q=ap&match=contains&sort=headword&bookmarked=1&page=2");
  });

  test("falls back to defaults for invalid values", () => {
    expect(parseWordListReturnHref({ q: "ap", sort: "bogus", match: "bogus", page: "0" })).toBe(
      "/words?q=ap",
    );
  });
});

describe("buildNewWordHref → parseWordListReturnHref のラウンドトリップ", () => {
  /** 生成した /words/new URL の searchParams を、ページが受け取る生の形に戻す。 */
  function rawParamsOf(href: string) {
    const sp = new URL(href, "https://example.test").searchParams;
    return {
      q: sp.get("q") ?? undefined,
      sort: sp.get("sort") ?? undefined,
      match: sp.get("match") ?? undefined,
      bookmarked: sp.get("bookmarked") ?? undefined,
      page: sp.get("page") ?? undefined,
    };
  }

  test.each([
    { q: "ap", sort: "recent", match: "prefix", bookmarked: false, page: 1 },
    { q: "ap", sort: "headword", match: "contains", bookmarked: true, page: 2 },
    { q: "ré", sort: "recent", match: "suffix", bookmarked: false, page: 5 },
    { q: "RUN", sort: "headword", match: "prefix", bookmarked: true, page: 1 },
  ] as const)("元の一覧 URL に戻る: %o", (ctx) => {
    expect(parseWordListReturnHref(rawParamsOf(buildNewWordHref(ctx)))).toBe(
      buildWordsHref("word", ctx),
    );
  });
});
