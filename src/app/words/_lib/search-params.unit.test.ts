import { describe, expect, test } from "vitest";

import {
  buildWordDetailHref,
  buildWordsHref,
  parseMatch,
  parseOrder,
  parseRangeNumber,
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

describe("buildWordDetailHref", () => {
  test("always carries occ, omits defaults", () => {
    expect(buildWordDetailHref("w1", { occ: "occ1", match: "prefix", order: "asc" })).toBe(
      "/words/w1?occ=occ1",
    );
  });

  test("includes non-default filter values", () => {
    expect(
      buildWordDetailHref("w1", {
        occ: "occ1",
        q: "ap",
        match: "suffix",
        from: "2",
        to: "8",
        order: "desc",
      }),
    ).toBe("/words/w1?occ=occ1&q=ap&match=suffix&from=2&to=8&order=desc");
  });
});
