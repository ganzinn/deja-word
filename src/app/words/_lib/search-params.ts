import { headwordSchema } from "@/lib/schema/word-form";
import { normalizeSearchKeyword } from "@/lib/search-keyword";

import type { OccurrenceNumberOrder, WordListSort, WordMatchMode } from "@/lib/words-list";

import type { WordsViewMode } from "../_components/view-mode-toggle";

/**
 * 単語一覧・単語詳細で共有する searchParams のパーサと URL ビルダ。
 * 不正値はデフォルトへフォールバックし、URL 改ざん時も安全な値に正規化する。
 */

export function parseMatch(value: string | undefined): WordMatchMode {
  return value === "contains" ? "contains" : value === "suffix" ? "suffix" : "prefix";
}

export function parseSort(value: string | undefined): WordListSort {
  return value === "headword" ? "headword" : "recent";
}

/** ページ番号。1 以上の整数のみ採用し、それ以外は 1 ページ目へフォールバック。 */
export function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/** 掲載番号レンジ用。1 以上の整数のみ採用し、それ以外は未指定(undefined)扱い。 */
export function parseRangeNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
}

export function parseOrder(value: string | undefined): OccurrenceNumberOrder {
  return value === "desc" ? "desc" : "asc";
}

/** view 別の単語一覧 URL を構築する。デフォルト値は URL に含めない。 */
export function buildWordsHref(
  view: WordsViewMode,
  opts: {
    q?: string;
    sort?: WordListSort;
    match?: WordMatchMode;
    occ?: string;
    from?: string;
    to?: string;
    order?: OccurrenceNumberOrder;
    bookmarked?: boolean;
    page: number;
  },
): string {
  const params = new URLSearchParams();
  if (view === "occurrence") params.set("view", "occurrence");
  if (opts.occ) params.set("occ", opts.occ);
  if (opts.q && opts.q.length > 0) params.set("q", opts.q);
  if (opts.match && opts.match !== "prefix") params.set("match", opts.match);
  if (opts.sort && opts.sort !== "recent") params.set("sort", opts.sort);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  if (opts.order && opts.order !== "asc") params.set("order", opts.order);
  if (opts.bookmarked) params.set("bookmarked", "1");
  if (opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs.length > 0 ? `/words?${qs}` : "/words";
}

/** 掲載箇所ビューから単語詳細へ渡す絞り込みコンテキスト。 */
export type WordDetailOccurrenceContext = {
  kind: "occurrence";
  occ: string;
  q?: string;
  match: WordMatchMode;
  from?: string;
  to?: string;
  order: OccurrenceNumberOrder;
  bookmarked: boolean;
};

/** 単語ビューから単語詳細へ渡す絞り込みコンテキスト。 */
export type WordDetailWordViewContext = {
  kind: "word";
  sort: WordListSort;
  q?: string;
  match: WordMatchMode;
  bookmarked: boolean;
};

/** 単語詳細の前後ナビが従うコンテキスト。kind で由来ビューを判別する。 */
export type WordDetailNavContext = WordDetailOccurrenceContext | WordDetailWordViewContext;

/** 単語詳細・単語編集の searchParams（ナビコンテキストとして解釈しうるもの）。 */
export type RawWordDetailNavParams = {
  occ?: string;
  view?: string;
  q?: string;
  match?: string;
  sort?: string;
  from?: string;
  to?: string;
  order?: string;
  bookmarked?: string;
};

/**
 * searchParams から前後ナビのコンテキストを取り出す。判別順は
 * (1) occ があれば掲載箇所コンテキスト（view=word が同時に付いていても occ 優先）、
 * (2) view=word があれば単語ビューコンテキスト、(3) どちらも無ければ null（ナビ非表示）。
 * 不正値は各パーサがデフォルトへ正規化するため、URL 改ざん時も安全な値になる。
 */
export function parseWordDetailNavContext(sp: RawWordDetailNavParams): WordDetailNavContext | null {
  if (sp.occ) {
    return {
      kind: "occurrence",
      occ: sp.occ,
      q: (sp.q ?? "").trim(),
      match: parseMatch(sp.match),
      from: sp.from,
      to: sp.to,
      order: parseOrder(sp.order),
      bookmarked: sp.bookmarked === "1",
    };
  }
  if (sp.view === "word") {
    return {
      kind: "word",
      sort: sp.sort === "headword" ? "headword" : "recent",
      q: (sp.q ?? "").trim(),
      match: parseMatch(sp.match),
      bookmarked: sp.bookmarked === "1",
    };
  }
  return null;
}

/**
 * ナビコンテキストをクエリ文字列へ直す。
 * buildWordsHref と同じ方針でデフォルト値（match=prefix / sort=recent / order=asc / 空値）は
 * 含めない。判別子（occ / view=word）だけは常時付与する。
 */
function buildNavContextQuery(ctx: WordDetailNavContext): string {
  const params = new URLSearchParams();
  if (ctx.kind === "occurrence") {
    params.set("occ", ctx.occ);
    if (ctx.q && ctx.q.length > 0) params.set("q", ctx.q);
    if (ctx.match !== "prefix") params.set("match", ctx.match);
    if (ctx.from) params.set("from", ctx.from);
    if (ctx.to) params.set("to", ctx.to);
    if (ctx.order !== "asc") params.set("order", ctx.order);
  } else {
    params.set("view", "word");
    if (ctx.q && ctx.q.length > 0) params.set("q", ctx.q);
    if (ctx.match !== "prefix") params.set("match", ctx.match);
    if (ctx.sort !== "recent") params.set("sort", ctx.sort);
  }
  if (ctx.bookmarked) params.set("bookmarked", "1");
  return params.toString();
}

/** ナビコンテキスト付きの単語詳細 URL を構築する。 */
export function buildWordDetailHref(wordId: string, ctx: WordDetailNavContext): string {
  return `/words/${wordId}?${buildNavContextQuery(ctx)}`;
}

/**
 * ナビコンテキスト付きの単語編集 URL を構築する。
 * 編集後に詳細へ戻ったとき前後ナビを維持するため、編集画面まで絞り込みを持ち回る。
 */
export function buildWordEditHref(wordId: string, ctx: WordDetailNavContext): string {
  return `/words/${wordId}/edit?${buildNavContextQuery(ctx)}`;
}

/** 単語ビューの一覧コンテキスト。登録フォームへの引き回し（プリフィル・戻り先）で使う。 */
export type WordListContext = {
  q: string;
  sort: WordListSort;
  match: WordMatchMode;
  bookmarked: boolean;
  page: number;
};

/** 単語ビュー / 登録フォームの searchParams（一覧コンテキストとして解釈しうるもの）。 */
export type RawWordListContextParams = {
  q?: string;
  sort?: string;
  match?: string;
  bookmarked?: string;
  page?: string;
};

/** searchParams から単語ビューの一覧コンテキストを取り出す。不正値はデフォルトへ正規化する。 */
export function parseWordListContext(sp: RawWordListContextParams): WordListContext {
  return {
    q: (sp.q ?? "").trim(),
    sort: parseSort(sp.sort),
    match: parseMatch(sp.match),
    bookmarked: sp.bookmarked === "1",
    page: parsePage(sp.page),
  };
}

/**
 * 一覧コンテキスト付きの単語登録 URL を構築する。
 * 省略規則は buildWordsHref と同じ（デフォルト値・1 ページ目の page は含めない）。
 * プリフィル専用パラメータや生の戻り先 URL は持たせず、一覧の検索条件だけを渡す。
 */
export function buildNewWordHref(ctx: WordListContext): string {
  const params = new URLSearchParams();
  if (ctx.q.length > 0) params.set("q", ctx.q);
  if (ctx.match !== "prefix") params.set("match", ctx.match);
  if (ctx.sort !== "recent") params.set("sort", ctx.sort);
  if (ctx.bookmarked) params.set("bookmarked", "1");
  if (ctx.page > 1) params.set("page", String(ctx.page));
  const qs = params.toString();
  return qs.length > 0 ? `/words/new?${qs}` : "/words/new";
}

/**
 * 登録フォームの headword プリフィル値を検索キーワードから導出する。
 * 正規化（アクセント記号の除去と trim。大文字小文字は保持）した値が headwordSchema に
 * 通った場合のみ採用し、通らなければ null（プリフィルなし）。手打ち URL への防御を兼ねる。
 */
export function parsePrefillHeadword(q: string | undefined): string | null {
  const normalized = normalizeSearchKeyword(q ?? "");
  const parsed = headwordSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

/**
 * 登録フォームの戻り先（元の単語ビュー一覧 URL）を searchParams から再構築する。
 * 検索コンテキストの有無は q の trim 後が非空かで判別し、無ければ null（既定の /words）。
 */
export function parseWordListReturnHref(sp: RawWordListContextParams): string | null {
  const ctx = parseWordListContext(sp);
  if (ctx.q.length === 0) return null;
  return buildWordsHref("word", ctx);
}
