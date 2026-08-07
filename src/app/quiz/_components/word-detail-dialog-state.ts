import type { WordDetail } from "@/lib/words-detail";

/**
 * 単語詳細ダイアログの表示 state 導出と先読み対象決定（`word-detail-dialog.tsx` の純関数部）。
 *
 * ダイアログは前後ナビ中も「前の単語を表示したまま待つ」ため、
 * 「今どの単語の応答を待っているか」「何を表示するか」「何を先読みするか」が
 * 応答の鮮度（wordId 照合）とキャッシュの有無から決まる。React の外で完結する判断なので
 * ここに切り出して unit テストで固定する。
 * 前後ナビは結果一覧の表示行スナップショット（navOrder）の配列 index で同期導出し、
 * サーバへの隣接取得は行わない（docs/adr/0088-quiz-dialog-list-order-nav.md）。
 */

/** どの単語に対する応答かを wordId で持ち、render 側で鮮度を判定する。 */
export type DetailResponse =
  | { wordId: string; ok: true; word: WordDetail; bookmarked: boolean }
  | { wordId: string; ok: false; message: string };

/** 詳細キャッシュの値。表示に必要な分（単語詳細＋ブックマーク状態）だけ持つ。 */
export type CachedDetail = { word: WordDetail; bookmarked: boolean };

/** `wordId` → 詳細応答。 */
export type DetailCache = ReadonlyMap<string, CachedDetail>;

/** 直前まで表示していた ready 応答（応答待ちの間これを淡色化して見せる）。 */
export type LastReadyDetail = { wordId: string } & CachedDetail;

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

export type DialogNav =
  | { visible: false }
  | {
      visible: true;
      /** 「前へ」の遷移先。null なら押せない（端）。 */
      prevWordId: string | null;
      nextWordId: string | null;
    };

/**
 * 前後ナビ行の表示を導出する。現在位置は `navOrder.indexOf(wordId)`（1 語 1 問で wordId は
 * 一覧内一意）、prev / next は前後の要素で、端は null（ボタン disabled）。
 * `navOrder` が null（出題中・関連語スタック先）・`wordId` が集合外なら非表示。
 * 隣接は配列から同期的に決まるため応答待ちの状態を持たず、詳細取得の成否とも独立する
 * （削除済み単語のエラービュー表示中も前後ナビは操作できる）。
 */
export function resolveDialogNav(navOrder: string[] | null, wordId: string | null): DialogNav {
  if (navOrder === null || wordId === null) return { visible: false };
  const index = navOrder.indexOf(wordId);
  if (index === -1) return { visible: false };
  return {
    visible: true,
    prevWordId: index > 0 ? navOrder[index - 1] : null,
    nextWordId: index < navOrder.length - 1 ? navOrder[index + 1] : null,
  };
}

/**
 * 見出し語の右に出す掲載番号（#N）を、表示中の詳細データが持つ掲載箇所一覧から
 * `occurrenceId` に一致する行を引いて導出する。`occurrenceId` が null（ブックマーク全件
 * モード）・一致する掲載が無い・番号なしの場合は null（#N を出さない。ナビとは独立）。
 */
export function resolveOccurrenceNumber(
  word: WordDetail,
  occurrenceId: string | null,
): number | null {
  if (occurrenceId === null) return null;
  const match = word.wordOccurrences.find((wo) => wo.occurrenceId === occurrenceId);
  return match?.occurrenceNumber ?? null;
}

/** 先読みで発行すべき取得。 */
export type PrefetchTarget = { kind: "detail"; wordId: string };

/**
 * 先読み対象を決める。
 *
 * 表示中の単語の詳細が settle したときにだけ、`navOrder` 上の前後 1 件の未キャッシュ詳細を返す。
 * 連続送り中は中間の単語が settle しないため、無駄な先読みは自然に抑制される。
 * 隣接は配列で既知のため隣接応答の先読みは無い（docs/adr/0088-quiz-dialog-list-order-nav.md）。
 */
export function resolvePrefetchTargets(input: {
  navOrder: string[] | null;
  wordId: string | null;
  response: DetailResponse | null;
  detailCache: DetailCache;
}): PrefetchTarget[] {
  const { navOrder, wordId, response, detailCache } = input;
  // 前後ナビが出ない画面（出題中・関連語をたどった先）では先読みしない。
  if (wordId === null) return [];

  const nav = resolveDialogNav(navOrder, wordId);
  if (!nav.visible) return [];

  const detailSettled =
    detailCache.has(wordId) || (response !== null && response.wordId === wordId && response.ok);
  if (!detailSettled) return [];

  const targets: PrefetchTarget[] = [];
  for (const neighborId of [nav.prevWordId, nav.nextWordId]) {
    if (neighborId === null) continue;
    if (!detailCache.has(neighborId)) targets.push({ kind: "detail", wordId: neighborId });
  }
  return targets;
}
