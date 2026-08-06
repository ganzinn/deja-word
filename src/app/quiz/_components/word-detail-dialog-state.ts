import type { WordDetail } from "@/lib/words-detail";
import type { AdjacentWordsResult } from "@/lib/words-list";

/**
 * 単語詳細ダイアログの表示 state 導出と先読み対象決定（`word-detail-dialog.tsx` の純関数部）。
 *
 * ダイアログは前後ナビ中も「前の単語を表示したまま待つ」ため、
 * 「今どの単語の応答を待っているか」「何を表示するか」「何を先読みするか」が
 * 応答の鮮度（key 照合）とキャッシュの有無から決まる。React の外で完結する判断なので
 * ここに切り出して unit テストで固定する。
 */

/** どの単語に対する応答かを wordId で持ち、render 側で鮮度を判定する。 */
export type DetailResponse =
  | { wordId: string; ok: true; word: WordDetail; bookmarked: boolean }
  | { wordId: string; ok: false; message: string };

/** どの単語×掲載箇所に対する応答かを key で持ち、render 側で鮮度を判定する。 */
export type NavResponse = { key: string; nav: AdjacentWordsResult };

/** 詳細キャッシュの値。表示に必要な分（単語詳細＋ブックマーク状態）だけ持つ。 */
export type CachedDetail = { word: WordDetail; bookmarked: boolean };

/** `wordId` → 詳細応答。 */
export type DetailCache = ReadonlyMap<string, CachedDetail>;
/** `navCacheKey()` → 隣接応答（`null` は「ナビ対象外」の正常応答）。 */
export type NavCache = ReadonlyMap<string, AdjacentWordsResult>;

/** 隣接応答は単語だけでなく掲載箇所にも依存するため、両方を含む key で持つ。 */
export function navCacheKey(occurrenceId: string, wordId: string): string {
  return `${occurrenceId}:${wordId}`;
}

/** 直前まで表示していた ready 応答（応答待ちの間これを淡色化して見せる）。 */
export type LastReadyDetail = { wordId: string } & CachedDetail;
/** 直前まで表示していた隣接応答（ナビ対象外＝null は保持しない）。 */
export type LastNav = NonNullable<AdjacentWordsResult>;

export type DetailView =
  | { kind: "initial-loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; word: WordDetail; bookmarked: boolean; pending: boolean };

/**
 * 本文の表示 state を導出する。
 *
 * 現在の `wordId` の応答が無い間も、直前に表示していた内容があればそれを `pending` で見せる
 * （＝前の単語を残したまま待つ）。保持内容が無い初回ロードだけ「読み込み中…」に縮退する。
 * 先読み済み（キャッシュヒット）なら待ちが無いので `pending` は立てない。
 *
 * キャッシュを応答より優先するのは、ブックマークのトグルがキャッシュ側だけを更新するため
 * （前後移動で戻ってきたときに、取得時点の古いブックマーク状態を見せない）。
 */
export function resolveDetailView(input: {
  wordId: string | null;
  response: DetailResponse | null;
  lastReady: LastReadyDetail | null;
  detailCache: DetailCache;
}): DetailView {
  const { wordId, response, lastReady, detailCache } = input;
  if (wordId === null) return { kind: "initial-loading" };

  const cached = detailCache.get(wordId);
  if (cached !== undefined) {
    return { kind: "ready", word: cached.word, bookmarked: cached.bookmarked, pending: false };
  }

  if (response !== null && response.wordId === wordId) {
    return response.ok
      ? { kind: "ready", word: response.word, bookmarked: response.bookmarked, pending: false }
      : { kind: "error", message: response.message };
  }

  if (lastReady !== null) {
    return { kind: "ready", word: lastReady.word, bookmarked: lastReady.bookmarked, pending: true };
  }
  return { kind: "initial-loading" };
}

export type NavView =
  | { visible: false }
  | {
      visible: true;
      /** 「前へ」の遷移先。null なら押せない（端・応答待ち）。 */
      prevWordId: string | null;
      nextWordId: string | null;
      prevDisabled: boolean;
      nextDisabled: boolean;
      centerLabel: string;
    };

function occurrenceNumberLabel(occurrenceNumber: number | null): string {
  return occurrenceNumber !== null ? `No.${occurrenceNumber}` : "—";
}

/**
 * 現在の単語に対する隣接応答を取り出す。`undefined` は未取得（応答待ち）、
 * `null` は「掲載番号なし等でナビ対象外」の正常応答。先読み済みならキャッシュから即座に取れる。
 */
export function resolveCurrentNav(input: {
  wordId: string | null;
  occurrenceId: string | null;
  navResponse: NavResponse | null;
  navCache: NavCache;
}): AdjacentWordsResult | undefined {
  const { wordId, occurrenceId, navResponse, navCache } = input;
  if (wordId === null || occurrenceId === null) return undefined;
  const key = navCacheKey(occurrenceId, wordId);
  if (navResponse !== null && navResponse.key === key) return navResponse.nav;
  if (navCache.has(key)) return navCache.get(key) ?? null;
  return undefined;
}

/**
 * 前後ナビ行の表示を導出する。
 *
 * 応答待ちの間もナビ行は出したまま（消滅→再出現はレイアウトシフトになる）、
 * 直前の隣接応答をラベルごと残してボタンだけ disabled にする。
 * 初回オープン時は保持内容が無いので、現行どおり隣接応答の到着まで描画しない。
 */
export function resolveNavView(input: {
  wordId: string | null;
  occurrenceId: string | null;
  /** `onNavigate` が渡されているか（前後移動できない呼び出し元ではナビを出さない）。 */
  canNavigate: boolean;
  navResponse: NavResponse | null;
  lastNav: LastNav | null;
  navCache: NavCache;
}): NavView {
  const { wordId, occurrenceId, canNavigate, navResponse, lastNav, navCache } = input;
  if (wordId === null || occurrenceId === null || !canNavigate) return { visible: false };

  const fresh = resolveCurrentNav({ wordId, occurrenceId, navResponse, navCache });

  if (fresh !== undefined) {
    // null は「掲載番号なし等でナビ対象外」の正常応答。
    if (fresh === null) return { visible: false };
    return {
      visible: true,
      prevWordId: fresh.prev?.id ?? null,
      nextWordId: fresh.next?.id ?? null,
      prevDisabled: fresh.prev === null,
      nextDisabled: fresh.next === null,
      centerLabel: occurrenceNumberLabel(fresh.current.occurrenceNumber),
    };
  }

  if (lastNav === null) return { visible: false };
  return {
    visible: true,
    prevWordId: null,
    nextWordId: null,
    prevDisabled: true,
    nextDisabled: true,
    centerLabel: occurrenceNumberLabel(lastNav.current.occurrenceNumber),
  };
}

/** 先読みで発行すべき取得。 */
export type PrefetchTarget =
  | { kind: "detail"; wordId: string }
  | { kind: "adjacent"; occurrenceId: string; wordId: string };

/**
 * 先読み対象を決める。
 *
 * 表示中の単語の詳細・隣接がどちらも揃った（settled）ときにだけ、前後 1 件分の未キャッシュ分を返す。
 * 連続送り中は中間の単語が settle しないため、無駄な先読みは自然に抑制される。
 */
export function resolvePrefetchTargets(input: {
  wordId: string | null;
  occurrenceId: string | null;
  response: DetailResponse | null;
  navResponse: NavResponse | null;
  detailCache: DetailCache;
  navCache: NavCache;
}): PrefetchTarget[] {
  const { wordId, occurrenceId, response, navResponse, detailCache, navCache } = input;
  // 関連語をたどった先など、前後ナビが出ない画面では先読みしない。
  if (wordId === null || occurrenceId === null) return [];

  const detailSettled =
    detailCache.has(wordId) || (response !== null && response.wordId === wordId && response.ok);
  if (!detailSettled) return [];

  const nav = resolveCurrentNav({ wordId, occurrenceId, navResponse, navCache });
  // 隣接が未取得（undefined）／ナビ対象外（null）なら先読み先が定まらない。
  if (nav === undefined || nav === null) return [];

  const targets: PrefetchTarget[] = [];
  for (const neighbor of [nav.prev, nav.next]) {
    if (neighbor === null) continue;
    if (!detailCache.has(neighbor.id)) targets.push({ kind: "detail", wordId: neighbor.id });
    if (!navCache.has(navCacheKey(occurrenceId, neighbor.id))) {
      targets.push({ kind: "adjacent", occurrenceId, wordId: neighbor.id });
    }
  }
  return targets;
}
