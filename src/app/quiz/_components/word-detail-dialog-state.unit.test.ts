import { describe, expect, test } from "vitest";

import type { WordDetail } from "@/lib/words-detail";

import {
  resolveDetailView,
  resolveDialogNav,
  resolveOccurrenceNumber,
  resolvePrefetchTargets,
  type CachedDetail,
} from "./word-detail-dialog-state";

/** 表示 state 導出はどの単語かの同一性しか見ないため、id・見出し語だけの最小 fixture で足りる。 */
function word(id: string): WordDetail {
  return { id, headword: `w-${id}` } as unknown as WordDetail;
}

/** #N 導出用: 掲載箇所一覧（occurrenceId × occurrenceNumber）だけを持つ最小 fixture。 */
function wordWithOccurrences(
  id: string,
  occurrences: { occurrenceId: string; occurrenceNumber: number | null }[],
): WordDetail {
  return { id, headword: `w-${id}`, wordOccurrences: occurrences } as unknown as WordDetail;
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

// 導出は navOrder と wordId だけから決まる（引数に詳細応答を取らない）＝
// 詳細取得の成否と独立で、削除済み単語のエラービュー表示中もナビが操作できる。
describe("resolveDialogNav", () => {
  test("navOrder が null（出題中・関連語スタック先）ならナビを描画しない", () => {
    expect(resolveDialogNav(null, "a")).toEqual({ visible: false });
  });

  test("wordId が null（閉）ならナビを描画しない", () => {
    expect(resolveDialogNav(["a", "b"], null)).toEqual({ visible: false });
  });

  test("wordId が navOrder に無ければナビを描画しない", () => {
    expect(resolveDialogNav(["a", "b"], "x")).toEqual({ visible: false });
  });

  test("中間位置は前後の要素が遷移先になる", () => {
    expect(resolveDialogNav(["a", "b", "c"], "b")).toEqual({
      visible: true,
      prevWordId: "a",
      nextWordId: "c",
    });
  });

  test("先頭は prev が null（disabled）", () => {
    expect(resolveDialogNav(["a", "b", "c"], "a")).toEqual({
      visible: true,
      prevWordId: null,
      nextWordId: "b",
    });
  });

  test("末尾は next が null（disabled）", () => {
    expect(resolveDialogNav(["a", "b", "c"], "c")).toEqual({
      visible: true,
      prevWordId: "b",
      nextWordId: null,
    });
  });

  test("1 件だけの一覧は両端とも null（ナビ行は出る）", () => {
    expect(resolveDialogNav(["a"], "a")).toEqual({
      visible: true,
      prevWordId: null,
      nextWordId: null,
    });
  });
});

describe("resolveOccurrenceNumber", () => {
  const detail = wordWithOccurrences("a", [
    { occurrenceId: "occ_1", occurrenceNumber: 12 },
    { occurrenceId: "occ_2", occurrenceNumber: null },
  ]);

  test("occurrenceId に一致する掲載の番号を返す", () => {
    expect(resolveOccurrenceNumber(detail, "occ_1")).toBe(12);
  });

  test("occurrenceId が null（ブックマーク全件モード）は null", () => {
    expect(resolveOccurrenceNumber(detail, null)).toBeNull();
  });

  test("一致する掲載が無ければ null", () => {
    expect(resolveOccurrenceNumber(detail, "occ_x")).toBeNull();
  });

  test("一致する掲載が番号なしなら null", () => {
    expect(resolveOccurrenceNumber(detail, "occ_2")).toBeNull();
  });
});

describe("resolvePrefetchTargets", () => {
  const settledResponse = { wordId: "b", ok: true as const, word: word("b"), bookmarked: false };

  test("navOrder が null（出題中・関連語スタック先）なら先読みしない", () => {
    expect(
      resolvePrefetchTargets({
        navOrder: null,
        wordId: "b",
        response: settledResponse,
        detailCache: new Map(),
      }),
    ).toEqual([]);
  });

  test("詳細が未 settle（応答が前の単語のもの）なら何も先読みしない", () => {
    expect(
      resolvePrefetchTargets({
        navOrder: ["a", "b", "c"],
        wordId: "a",
        response: settledResponse,
        detailCache: new Map(),
      }),
    ).toEqual([]);
  });

  test("詳細がエラー（削除済み等）なら先読みしない", () => {
    expect(
      resolvePrefetchTargets({
        navOrder: ["a", "b", "c"],
        wordId: "b",
        response: { wordId: "b", ok: false, message: "対象の単語が見つかりません。" },
        detailCache: new Map(),
      }),
    ).toEqual([]);
  });

  test("settled なら navOrder 上の前後 1 件の詳細を発行する（隣接 kind は無い）", () => {
    expect(
      resolvePrefetchTargets({
        navOrder: ["a", "b", "c"],
        wordId: "b",
        response: settledResponse,
        detailCache: new Map(),
      }),
    ).toEqual([
      { kind: "detail", wordId: "a" },
      { kind: "detail", wordId: "c" },
    ]);
  });

  test("端（先頭）では存在する側だけ発行する", () => {
    expect(
      resolvePrefetchTargets({
        navOrder: ["b", "c"],
        wordId: "b",
        response: settledResponse,
        detailCache: new Map(),
      }),
    ).toEqual([{ kind: "detail", wordId: "c" }]);
  });

  test("キャッシュ済みの分は発行しない", () => {
    expect(
      resolvePrefetchTargets({
        navOrder: ["a", "b", "c"],
        wordId: "b",
        response: settledResponse,
        detailCache: detailCache({ a: { word: word("a"), bookmarked: false } }),
      }),
    ).toEqual([{ kind: "detail", wordId: "c" }]);
  });

  test("前後とも取得済みなら空", () => {
    expect(
      resolvePrefetchTargets({
        navOrder: ["a", "b", "c"],
        wordId: "b",
        response: settledResponse,
        detailCache: detailCache({
          a: { word: word("a"), bookmarked: false },
          c: { word: word("c"), bookmarked: false },
        }),
      }),
    ).toEqual([]);
  });

  test("詳細がキャッシュ由来（応答は前の単語のまま）でも settled として先読みする", () => {
    expect(
      resolvePrefetchTargets({
        navOrder: ["a", "b", "c"],
        wordId: "c",
        response: settledResponse,
        detailCache: detailCache({ c: { word: word("c"), bookmarked: false } }),
      }),
    ).toEqual([{ kind: "detail", wordId: "b" }]);
  });

  test("wordId が navOrder に無ければ先読みしない", () => {
    expect(
      resolvePrefetchTargets({
        navOrder: ["a", "c"],
        wordId: "b",
        response: settledResponse,
        detailCache: new Map(),
      }),
    ).toEqual([]);
  });
});
