import { describe, expect, test } from "vitest";

import { normalizeSearchKeyword } from "@/lib/search-keyword";

describe("normalizeSearchKeyword", () => {
  test("アクセント記号を落とす（合成済みの入力）", () => {
    expect(normalizeSearchKeyword("thóught")).toBe("thought");
    expect(normalizeSearchKeyword("péssimist")).toBe("pessimist");
    expect(normalizeSearchKeyword("suscèptibílity")).toBe("susceptibility");
    expect(normalizeSearchKeyword("àuthentícity")).toBe("authenticity");
  });

  test("分解済み（基底文字＋結合文字）の入力でも同じ結果になる", () => {
    expect(normalizeSearchKeyword("tho\u0301ught")).toBe("thought");
  });

  test("前後の空白を落とす", () => {
    expect(normalizeSearchKeyword("  áffluence  ")).toBe("affluence");
  });

  test("アクセント記号の無い入力は素通しする（大文字小文字は変えない）", () => {
    expect(normalizeSearchKeyword("Ubiquitous")).toBe("Ubiquitous");
    expect(normalizeSearchKeyword("take off")).toBe("take off");
  });

  test("結合文字だけの入力は空文字になる", () => {
    expect(normalizeSearchKeyword("́")).toBe("");
  });
});
