import { describe, expect, test } from "vitest";

import { composeSegmentClassName } from "./placeholder-text";
import { richTextMarkClassName } from "./rich-text";

describe("composeSegmentClassName", () => {
  test("ベース未指定ならプレースホルダ体裁とユーザー記法だけを合成する（従来と同じ結果）", () => {
    expect(composeSegmentClassName(undefined, "italic", richTextMarkClassName(["bold"]))).toBe(
      "italic font-bold",
    );
    expect(composeSegmentClassName(undefined, null, richTextMarkClassName(["red"]))).toBe(
      "text-red-500",
    );
  });

  test("ベースの赤字とユーザー記法の赤字が重なっても赤字のまま", () => {
    const className = composeSegmentClassName("text-red-500", null, richTextMarkClassName(["red"]));
    expect(className).toBe("text-red-500");
  });

  test("ベースの赤字とユーザー記法の太字は両立する", () => {
    const className = composeSegmentClassName(
      "text-red-500",
      null,
      richTextMarkClassName(["bold"]),
    );
    expect(className).toContain("text-red-500");
    expect(className).toContain("font-bold");
  });

  test("3 つとも空なら空文字（素の文字列を push する分岐が保たれる）", () => {
    expect(composeSegmentClassName(undefined, null, richTextMarkClassName([]))).toBe("");
  });
});
