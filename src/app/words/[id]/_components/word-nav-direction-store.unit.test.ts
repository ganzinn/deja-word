import { beforeEach, describe, expect, test, vi } from "vitest";

/** store はモジュールスコープの状態を持つため、各テストでモジュールごと作り直す。 */
async function loadStore() {
  return await import("./word-nav-direction-store");
}

describe("word-nav-direction-store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("記録が無ければ null（直接 URL アクセス・リロード）", async () => {
    const { consumeNavDirection } = await loadStore();
    expect(consumeNavDirection("/words/a?occ=o1")).toBeNull();
  });

  test("遷移先 href が一致すれば向きを返す", async () => {
    const { setNavDirection, consumeNavDirection } = await loadStore();
    setNavDirection("/words/b?occ=o1", "next");
    expect(consumeNavDirection("/words/b?occ=o1")).toBe("next");
  });

  test("一致して消費したら記録は消える（同じ URL に戻ってきても再生しない）", async () => {
    const { setNavDirection, consumeNavDirection } = await loadStore();
    setNavDirection("/words/b?occ=o1", "prev");
    expect(consumeNavDirection("/words/b?occ=o1")).toBe("prev");
    expect(consumeNavDirection("/words/b?occ=o1")).toBeNull();
  });

  test("遷移先 href が一致しなければ null（ブラウザの戻る/進む・別 URL への遷移）", async () => {
    const { setNavDirection, consumeNavDirection } = await loadStore();
    setNavDirection("/words/b?occ=o1", "next");
    expect(consumeNavDirection("/words/a?occ=o1")).toBeNull();
  });

  test("クエリ（絞り込みコンテキスト）が違えば別の遷移先として扱う", async () => {
    const { setNavDirection, consumeNavDirection } = await loadStore();
    setNavDirection("/words/b?occ=o1", "next");
    expect(consumeNavDirection("/words/b?occ=o2")).toBeNull();
  });

  test("保持するのは最新の 1 件だけ（連続操作は最後勝ち）", async () => {
    const { setNavDirection, consumeNavDirection } = await loadStore();
    setNavDirection("/words/b?occ=o1", "next");
    setNavDirection("/words/c?occ=o1", "next");
    expect(consumeNavDirection("/words/b?occ=o1")).toBeNull();
    expect(consumeNavDirection("/words/c?occ=o1")).toBe("next");
  });
});
