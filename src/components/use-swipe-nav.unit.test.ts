import { describe, expect, test } from "vitest";

import { resolveSwipeNavDirection } from "./use-swipe-nav";

describe("resolveSwipeNavDirection", () => {
  test("左フリック（指を左へ）は次へ", () => {
    expect(resolveSwipeNavDirection(-120, 0)).toBe("next");
  });

  test("右フリック（指を右へ）は前へ", () => {
    expect(resolveSwipeNavDirection(120, 0)).toBe("prev");
  });

  test("移動量が閾値未満なら発火しない（タップのブレ）", () => {
    expect(resolveSwipeNavDirection(-59, 0)).toBeNull();
    expect(resolveSwipeNavDirection(59, 0)).toBeNull();
  });

  test("閾値ちょうどは発火する", () => {
    expect(resolveSwipeNavDirection(-60, 0)).toBe("next");
    expect(resolveSwipeNavDirection(60, 0)).toBe("prev");
  });

  test("縦移動が大きい斜め移動は発火しない（縦スクロール中のブレ）", () => {
    expect(resolveSwipeNavDirection(80, 60)).toBeNull();
    expect(resolveSwipeNavDirection(-80, -60)).toBeNull();
  });

  test("縦移動があっても横が 2 倍以上あれば発火する", () => {
    expect(resolveSwipeNavDirection(80, 40)).toBe("prev");
    expect(resolveSwipeNavDirection(-80, 40)).toBe("next");
  });

  test("縦だけの移動は発火しない", () => {
    expect(resolveSwipeNavDirection(0, 200)).toBeNull();
  });
});
