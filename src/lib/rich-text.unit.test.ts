import { describe, expect, test } from "vitest";

import {
  hasRichTextMarkup,
  parseRichText,
  stripRichTextMarkup,
  type RichTextSegment,
} from "./rich-text";

/** 期待値を読みやすく書くための短縮形（marks の配列は正規順序で返る）。 */
function seg(text: string, ...marks: RichTextSegment["marks"]): RichTextSegment {
  return { text, marks };
}

describe("parseRichText", () => {
  test("装飾が無いテキストは 1 セグメントで返る", () => {
    expect(parseRichText("走る、駆ける")).toEqual([seg("走る、駆ける")]);
  });

  test("空文字はセグメント 0 件", () => {
    expect(parseRichText("")).toEqual([]);
  });

  test("4 種の記法をそれぞれ 1 つの装飾として認識する", () => {
    expect(parseRichText("**太字**")).toEqual([seg("太字", "bold")]);
    expect(parseRichText("*斜体*")).toEqual([seg("斜体", "italic")]);
    expect(parseRichText("==赤==")).toEqual([seg("赤", "red")]);
    expect(parseRichText("__下線__")).toEqual([seg("下線", "underline")]);
  });

  test("装飾の前後の素テキストを分けて返す", () => {
    expect(parseRichText("この用法は**必ず**to を伴う")).toEqual([
      seg("この用法は"),
      seg("必ず", "bold"),
      seg("to を伴う"),
    ]);
  });

  test("1 文中の複数の装飾をそれぞれ拾う", () => {
    expect(parseRichText("**必ず**==前置詞 to==を伴う")).toEqual([
      seg("必ず", "bold"),
      seg("前置詞 to", "red"),
      seg("を伴う"),
    ]);
  });

  test("*** は太字＋斜体の 1 記号として扱う（Markdown と同じ）", () => {
    expect(parseRichText("***太字斜体***")).toEqual([seg("太字斜体", "bold", "italic")]);
    expect(parseRichText("***a*** と ***b***")).toEqual([
      seg("a", "bold", "italic"),
      seg(" と "),
      seg("b", "bold", "italic"),
    ]);
  });

  test("*** と他の装飾を重ねられる（どちらを外側に書いても同じ）", () => {
    const expected = [seg("赤い太字斜体", "bold", "italic", "red")];
    expect(parseRichText("==***赤い太字斜体***==")).toEqual(expected);
    expect(parseRichText("***==赤い太字斜体==***")).toEqual(expected);
  });

  test("閉じない *** は装飾にしない", () => {
    expect(parseRichText("***")).toEqual([seg("***")]);
    expect(parseRichText("a***b")).toEqual([seg("a***b")]);
  });

  test("入れ子は marks を重ねて返す（正規順序: bold→italic→red→underline）", () => {
    expect(parseRichText("**==赤い太字==**")).toEqual([seg("赤い太字", "bold", "red")]);
    expect(parseRichText("==__赤い下線__==")).toEqual([seg("赤い下線", "red", "underline")]);
  });

  test("入れ子の一部だけに装飾が乗る", () => {
    expect(parseRichText("**太字と*斜体*と太字**")).toEqual([
      seg("太字と", "bold"),
      seg("斜体", "bold", "italic"),
      seg("と太字", "bold"),
    ]);
  });

  test("** は * より優先して照合する（太字が斜体に食われない）", () => {
    expect(parseRichText("**太字**")).not.toEqual([seg("*太字*", "italic")]);
  });

  test("閉じ記号が無い記号は装飾にせず文字として残す", () => {
    expect(parseRichText("2 * 3 = 6")).toEqual([seg("2 * 3 = 6")]);
    expect(parseRichText("**閉じ忘れ")).toEqual([seg("**閉じ忘れ")]);
    expect(parseRichText("a__b")).toEqual([seg("a__b")]);
  });

  test("中身が空の記号は装飾にしない", () => {
    expect(parseRichText("****")).toEqual([seg("****")]);
    expect(parseRichText("あ==い")).toEqual([seg("あ==い")]);
  });

  test("単独のアンダースコア・アスタリスクは装飾記号にならない", () => {
    expect(parseRichText("snake_case_name")).toEqual([seg("snake_case_name")]);
  });

  test("装飾は改行をまたげる", () => {
    expect(parseRichText("**1 行目\n2 行目**")).toEqual([seg("1 行目\n2 行目", "bold")]);
  });

  test("同じ装飾を連続して使える", () => {
    expect(parseRichText("**あ**い**う**")).toEqual([
      seg("あ", "bold"),
      seg("い"),
      seg("う", "bold"),
    ]);
  });
});

describe("hasRichTextMarkup", () => {
  test("装飾の有無を判定する", () => {
    expect(hasRichTextMarkup("走る")).toBe(false);
    expect(hasRichTextMarkup("2 * 3")).toBe(false);
    expect(hasRichTextMarkup("**走る**")).toBe(true);
  });
});

describe("stripRichTextMarkup", () => {
  test("装飾記号だけを取り除く", () => {
    expect(stripRichTextMarkup("**必ず**==前置詞 to==を伴う")).toBe("必ず前置詞 toを伴う");
  });

  test("装飾にならない記号はそのまま残す", () => {
    expect(stripRichTextMarkup("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  test("装飾が無いテキストは変わらない", () => {
    expect(stripRichTextMarkup("走る、駆ける")).toBe("走る、駆ける");
  });
});
