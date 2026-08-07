import { describe, expect, test } from "vitest";

import {
  InvalidNumberRangeError,
  formatOccurrenceNumberRanges,
  parseOccurrenceNumberRanges,
} from "@/lib/occurrence-sync";

describe("parseOccurrenceNumberRanges", () => {
  test("単一番号・範囲・複数指定を昇順の掲載番号に展開する", () => {
    expect(parseOccurrenceNumberRanges("7")).toEqual([7]);
    expect(parseOccurrenceNumberRanges("3-5")).toEqual([3, 4, 5]);
    expect(parseOccurrenceNumberRanges("5-6,1,3")).toEqual([1, 3, 5, 6]);
  });

  test("空白と重複を許容し、重複は 1 つに畳む", () => {
    expect(parseOccurrenceNumberRanges(" 1 - 3 , 2 , 3 ")).toEqual([1, 2, 3]);
  });

  test("空・非数値・逆順・0 始まりは InvalidNumberRangeError", () => {
    expect(() => parseOccurrenceNumberRanges("")).toThrow(InvalidNumberRangeError);
    expect(() => parseOccurrenceNumberRanges("1,,3")).toThrow(InvalidNumberRangeError);
    expect(() => parseOccurrenceNumberRanges("a-b")).toThrow(InvalidNumberRangeError);
    expect(() => parseOccurrenceNumberRanges("1-")).toThrow(InvalidNumberRangeError);
    expect(() => parseOccurrenceNumberRanges("10-3")).toThrow(InvalidNumberRangeError);
    expect(() => parseOccurrenceNumberRanges("0-3")).toThrow(InvalidNumberRangeError);
  });

  test("上限を超える範囲は展開せずエラーにする（打ち間違い対策）", () => {
    expect(() => parseOccurrenceNumberRanges("1-100001")).toThrow(InvalidNumberRangeError);
  });
});

describe("formatOccurrenceNumberRanges", () => {
  test("連続した掲載番号をレンジ表記に畳む（parse の逆）", () => {
    expect(formatOccurrenceNumberRanges([1, 2, 3, 10, 11, 20])).toBe("1-3,10-11,20");
    expect(formatOccurrenceNumberRanges([5])).toBe("5");
    expect(formatOccurrenceNumberRanges([])).toBe("(なし)");
  });

  test("順不同・重複を受けても正規化する", () => {
    expect(formatOccurrenceNumberRanges([3, 1, 2, 2])).toBe("1-3");
  });

  test("parse → format で往復する", () => {
    const spec = "1-100,1581-1600";
    expect(formatOccurrenceNumberRanges(parseOccurrenceNumberRanges(spec))).toBe(spec);
  });
});
