import { describe, expect, test } from "vitest";

import type { WordDetail } from "@/lib/words-detail";
import type { AdjacentWordsResult } from "@/lib/words-list";

import {
  navCacheKey,
  resolveCurrentNav,
  resolveDetailView,
  resolveNavView,
  resolvePrefetchTargets,
  type CachedDetail,
  type NavResponse,
} from "./word-detail-dialog-state";

/** 表示 state 導出はどの単語かの同一性しか見ないため、id・見出し語だけの最小 fixture で足りる。 */
function word(id: string): WordDetail {
  return { id, headword: `w-${id}` } as unknown as WordDetail;
}

const OCC = "occ_1";

function nav(input: {
  occurrenceNumber?: number | null;
  prev?: string | null;
  next?: string | null;
}): NonNullable<AdjacentWordsResult> {
  const ref = (id: string) => ({ id, headword: `w-${id}`, occurrenceNumber: null });
  return {
    current: {
      occurrenceNumber: input.occurrenceNumber === undefined ? 10 : input.occurrenceNumber,
    },
    prev: input.prev != null ? ref(input.prev) : null,
    next: input.next != null ? ref(input.next) : null,
  };
}

function navResponse(wordId: string, value: AdjacentWordsResult): NavResponse {
  return { key: navCacheKey(OCC, wordId), nav: value };
}

function detailCache(entries: Record<string, CachedDetail>): Map<string, CachedDetail> {
  return new Map(Object.entries(entries));
}

describe("resolveDetailView", () => {
  test("初回ロード（応答も保持内容も無い）は読み込み中", () => {
    expect(
      resolveDetailView({
        wordId: "a",
        response: null,
        lastReady: null,
        detailCache: new Map(),
      }),
    ).toEqual({ kind: "initial-loading" });
  });

  test("閉じている（wordId が null）ときは読み込み中扱い（本文を描画しない）", () => {
    expect(
      resolveDetailView({
        wordId: null,
        response: { wordId: "a", ok: true, word: word("a"), bookmarked: false },
        lastReady: { wordId: "a", word: word("a"), bookmarked: false },
        detailCache: new Map(),
      }),
    ).toEqual({ kind: "initial-loading" });
  });

  test("現在の単語の応答が届いていれば ready（pending なし）", () => {
    expect(
      resolveDetailView({
        wordId: "a",
        response: { wordId: "a", ok: true, word: word("a"), bookmarked: true },
        lastReady: null,
        detailCache: new Map(),
      }),
    ).toEqual({ kind: "ready", word: word("a"), bookmarked: true, pending: false });
  });

  test("切替中（応答が前の単語のもの）は保持内容を pending で表示する", () => {
    const view = resolveDetailView({
      wordId: "b",
      response: { wordId: "a", ok: true, word: word("a"), bookmarked: false },
      lastReady: { wordId: "a", word: word("a"), bookmarked: true },
      detailCache: new Map(),
    });
    expect(view).toEqual({ kind: "ready", word: word("a"), bookmarked: true, pending: true });
  });

  test("キャッシュヒット時は応答を待たず即 ready（pending なし）", () => {
    const view = resolveDetailView({
      wordId: "b",
      response: { wordId: "a", ok: true, word: word("a"), bookmarked: false },
      lastReady: { wordId: "a", word: word("a"), bookmarked: false },
      detailCache: detailCache({ b: { word: word("b"), bookmarked: true } }),
    });
    expect(view).toEqual({ kind: "ready", word: word("b"), bookmarked: true, pending: false });
  });

  test("同じ単語でもキャッシュを優先する（トグル後のブックマーク状態が勝つ）", () => {
    const view = resolveDetailView({
      wordId: "a",
      response: { wordId: "a", ok: true, word: word("a"), bookmarked: false },
      lastReady: null,
      detailCache: detailCache({ a: { word: word("a"), bookmarked: true } }),
    });
    expect(view).toEqual({ kind: "ready", word: word("a"), bookmarked: true, pending: false });
  });

  test("現在の単語の応答がエラーならエラー表示（保持内容には落とさない）", () => {
    expect(
      resolveDetailView({
        wordId: "b",
        response: { wordId: "b", ok: false, message: "取得に失敗しました。" },
        lastReady: { wordId: "a", word: word("a"), bookmarked: false },
        detailCache: new Map(),
      }),
    ).toEqual({ kind: "error", message: "取得に失敗しました。" });
  });
});

describe("resolveCurrentNav", () => {
  test("応答・キャッシュのいずれにも無ければ undefined（応答待ち）", () => {
    expect(
      resolveCurrentNav({
        wordId: "b",
        occurrenceId: OCC,
        navResponse: navResponse("a", nav({})),
        navCache: new Map(),
      }),
    ).toBeUndefined();
  });

  test("キャッシュの null（ナビ対象外）は未取得と区別する", () => {
    expect(
      resolveCurrentNav({
        wordId: "b",
        occurrenceId: OCC,
        navResponse: null,
        navCache: new Map([[navCacheKey(OCC, "b"), null]]),
      }),
    ).toBeNull();
  });
});

describe("resolveNavView", () => {
  test("occurrenceId が null ならナビを描画しない", () => {
    expect(
      resolveNavView({
        wordId: "a",
        occurrenceId: null,
        canNavigate: true,
        navResponse: null,
        lastNav: null,
        navCache: new Map(),
      }),
    ).toEqual({ visible: false });
  });

  test("onNavigate が無ければナビを描画しない", () => {
    expect(
      resolveNavView({
        wordId: "a",
        occurrenceId: OCC,
        canNavigate: false,
        navResponse: navResponse("a", nav({ prev: "z", next: "b" })),
        lastNav: null,
        navCache: new Map(),
      }),
    ).toEqual({ visible: false });
  });

  test("初回オープンは隣接応答の到着まで描画しない", () => {
    expect(
      resolveNavView({
        wordId: "a",
        occurrenceId: OCC,
        canNavigate: true,
        navResponse: null,
        lastNav: null,
        navCache: new Map(),
      }),
    ).toEqual({ visible: false });
  });

  test("隣接応答が届いたら前後の遷移先つきで描画する", () => {
    expect(
      resolveNavView({
        wordId: "a",
        occurrenceId: OCC,
        canNavigate: true,
        navResponse: navResponse("a", nav({ occurrenceNumber: 12, prev: "z", next: "b" })),
        lastNav: null,
        navCache: new Map(),
      }),
    ).toEqual({
      visible: true,
      prevWordId: "z",
      nextWordId: "b",
      prevDisabled: false,
      nextDisabled: false,
      centerLabel: "No.12",
    });
  });

  test("端（prev なし）はそのボタンだけ disabled", () => {
    const view = resolveNavView({
      wordId: "a",
      occurrenceId: OCC,
      canNavigate: true,
      navResponse: navResponse("a", nav({ prev: null, next: "b" })),
      lastNav: null,
      navCache: new Map(),
    });
    expect(view).toMatchObject({ visible: true, prevWordId: null, prevDisabled: true });
    expect(view).toMatchObject({ nextWordId: "b", nextDisabled: false });
  });

  test("ナビ対象外（応答が null）はナビを描画しない", () => {
    expect(
      resolveNavView({
        wordId: "a",
        occurrenceId: OCC,
        canNavigate: true,
        navResponse: navResponse("a", null),
        lastNav: nav({ prev: "z", next: "b" }),
        navCache: new Map(),
      }),
    ).toEqual({ visible: false });
  });

  test("前後移動中は最後の隣接応答（中央ラベル）を残してボタンを disabled にする", () => {
    expect(
      resolveNavView({
        wordId: "b",
        occurrenceId: OCC,
        canNavigate: true,
        navResponse: navResponse("a", nav({ occurrenceNumber: 12, prev: "z", next: "b" })),
        lastNav: nav({ occurrenceNumber: 12, prev: "z", next: "b" }),
        navCache: new Map(),
      }),
    ).toEqual({
      visible: true,
      prevWordId: null,
      nextWordId: null,
      prevDisabled: true,
      nextDisabled: true,
      centerLabel: "No.12",
    });
  });

  test("隣接がキャッシュヒットなら移動直後から操作できる", () => {
    expect(
      resolveNavView({
        wordId: "b",
        occurrenceId: OCC,
        canNavigate: true,
        navResponse: navResponse("a", nav({ occurrenceNumber: 12, prev: "z", next: "b" })),
        lastNav: nav({ occurrenceNumber: 12, prev: "z", next: "b" }),
        navCache: new Map([
          [navCacheKey(OCC, "b"), nav({ occurrenceNumber: 13, prev: "a", next: "c" })],
        ]),
      }),
    ).toEqual({
      visible: true,
      prevWordId: "a",
      nextWordId: "c",
      prevDisabled: false,
      nextDisabled: false,
      centerLabel: "No.13",
    });
  });

  test("掲載番号なしの中央ラベルは「—」", () => {
    expect(
      resolveNavView({
        wordId: "a",
        occurrenceId: OCC,
        canNavigate: true,
        navResponse: navResponse("a", nav({ occurrenceNumber: null, next: "b" })),
        lastNav: null,
        navCache: new Map(),
      }),
    ).toMatchObject({ centerLabel: "—" });
  });
});

describe("resolvePrefetchTargets", () => {
  const settledResponse = { wordId: "a", ok: true as const, word: word("a"), bookmarked: false };

  test("詳細が未 settle（応答が前の単語のもの）なら何も先読みしない", () => {
    expect(
      resolvePrefetchTargets({
        wordId: "b",
        occurrenceId: OCC,
        response: settledResponse,
        navResponse: navResponse("b", nav({ prev: "a", next: "c" })),
        detailCache: new Map(),
        navCache: new Map(),
      }),
    ).toEqual([]);
  });

  test("隣接が未 settle なら何も先読みしない", () => {
    expect(
      resolvePrefetchTargets({
        wordId: "a",
        occurrenceId: OCC,
        response: settledResponse,
        navResponse: null,
        detailCache: new Map(),
        navCache: new Map(),
      }),
    ).toEqual([]);
  });

  test("詳細がエラーなら先読みしない", () => {
    expect(
      resolvePrefetchTargets({
        wordId: "a",
        occurrenceId: OCC,
        response: { wordId: "a", ok: false, message: "取得に失敗しました。" },
        navResponse: navResponse("a", nav({ prev: "z", next: "b" })),
        detailCache: new Map(),
        navCache: new Map(),
      }),
    ).toEqual([]);
  });

  test("settled なら前後 1 件の詳細・隣接を発行する", () => {
    expect(
      resolvePrefetchTargets({
        wordId: "a",
        occurrenceId: OCC,
        response: settledResponse,
        navResponse: navResponse("a", nav({ prev: "z", next: "b" })),
        detailCache: new Map(),
        navCache: new Map(),
      }),
    ).toEqual([
      { kind: "detail", wordId: "z" },
      { kind: "adjacent", occurrenceId: OCC, wordId: "z" },
      { kind: "detail", wordId: "b" },
      { kind: "adjacent", occurrenceId: OCC, wordId: "b" },
    ]);
  });

  test("キャッシュ済みの分は発行しない（隣接だけ未取得なら隣接のみ）", () => {
    expect(
      resolvePrefetchTargets({
        wordId: "a",
        occurrenceId: OCC,
        response: settledResponse,
        navResponse: navResponse("a", nav({ prev: null, next: "b" })),
        detailCache: detailCache({ b: { word: word("b"), bookmarked: false } }),
        navCache: new Map(),
      }),
    ).toEqual([{ kind: "adjacent", occurrenceId: OCC, wordId: "b" }]);
  });

  test("前後とも取得済みなら空", () => {
    expect(
      resolvePrefetchTargets({
        wordId: "a",
        occurrenceId: OCC,
        response: settledResponse,
        navResponse: navResponse("a", nav({ prev: null, next: "b" })),
        detailCache: detailCache({ b: { word: word("b"), bookmarked: false } }),
        navCache: new Map([[navCacheKey(OCC, "b"), nav({ prev: "a", next: "c" })]]),
      }),
    ).toEqual([]);
  });

  test("詳細がキャッシュ由来（応答は前の単語のまま）でも settled として先読みする", () => {
    expect(
      resolvePrefetchTargets({
        wordId: "b",
        occurrenceId: OCC,
        response: settledResponse,
        navResponse: null,
        detailCache: detailCache({ b: { word: word("b"), bookmarked: false } }),
        navCache: new Map([[navCacheKey(OCC, "b"), nav({ prev: null, next: "c" })]]),
      }),
    ).toEqual([
      { kind: "detail", wordId: "c" },
      { kind: "adjacent", occurrenceId: OCC, wordId: "c" },
    ]);
  });

  test("occurrenceId が null（関連語をたどった先）なら先読みしない", () => {
    expect(
      resolvePrefetchTargets({
        wordId: "a",
        occurrenceId: null,
        response: settledResponse,
        navResponse: navResponse("a", nav({ prev: "z", next: "b" })),
        detailCache: new Map(),
        navCache: new Map(),
      }),
    ).toEqual([]);
  });

  test("ナビ対象外（隣接が null）なら先読みしない", () => {
    expect(
      resolvePrefetchTargets({
        wordId: "a",
        occurrenceId: OCC,
        response: settledResponse,
        navResponse: navResponse("a", null),
        detailCache: new Map(),
        navCache: new Map(),
      }),
    ).toEqual([]);
  });
});
