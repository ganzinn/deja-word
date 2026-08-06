import { describe, expect, test } from "vitest";

import { slideInClass } from "./word-content-transition-classes";

describe("slideInClass", () => {
  test("「次へ」は右から進入する", () => {
    expect(slideInClass("next")).toBe(
      "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-8 motion-safe:duration-200",
    );
  });

  test("「前へ」は左から進入する", () => {
    expect(slideInClass("prev")).toBe(
      "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-8 motion-safe:duration-200",
    );
  });

  test("方向が無ければ演出なし", () => {
    expect(slideInClass(null)).toBe("");
  });

  test("アニメ系クラスは全て motion-safe: 付き（reduce-motion では即時差し替え）", () => {
    for (const direction of ["next", "prev"] as const) {
      const classes = slideInClass(direction).split(" ");
      expect(classes.length).toBeGreaterThan(0);
      for (const className of classes) {
        expect(className).toMatch(/^motion-safe:/);
      }
    }
  });
});
