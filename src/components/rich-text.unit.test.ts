import { describe, expect, test } from "vitest";

import { richTextMarkClassName } from "./rich-text";

describe("richTextMarkClassName", () => {
  test("太字・斜体・赤文字のクラスを返す", () => {
    expect(richTextMarkClassName(["bold"])).toContain("font-bold");
    expect(richTextMarkClassName(["italic"])).toContain("italic");
    expect(richTextMarkClassName(["red"])).toContain("text-red-500");
  });

  test("青下線は線だけを青くし、文字色は変えない", () => {
    const className = richTextMarkClassName(["underline"]);
    expect(className).toContain("underline");
    expect(className).toContain("decoration-blue-500");
    // text-blue-500 を混ぜると文字まで青くなる（issue 報告の不具合）
    expect(className).not.toContain("text-blue-500");
  });

  test("青下線と赤文字を重ねると、文字は赤・線は青になる", () => {
    const className = richTextMarkClassName(["red", "underline"]);
    expect(className).toContain("text-red-500");
    expect(className).toContain("decoration-blue-500");
  });

  test("装飾なしは空文字", () => {
    expect(richTextMarkClassName([])).toBe("");
  });
});
