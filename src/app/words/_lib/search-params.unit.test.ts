import { describe, expect, test } from "vitest";

import {
  buildWordDetailHref,
  buildWordEditHref,
  buildWordsHref,
  parseMatch,
  parseOrder,
  parseRangeNumber,
  parseWordDetailNavContext,
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
