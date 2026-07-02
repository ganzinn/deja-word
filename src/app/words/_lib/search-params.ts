import type { OccurrenceNumberOrder, WordListSort, WordMatchMode } from "@/lib/words-list";

import type { WordsViewMode } from "../_components/view-mode-toggle";

/**
 * 単語一覧・単語詳細で共有する searchParams のパーサと URL ビルダ。
 * 不正値はデフォルトへフォールバックし、URL 改ざん時も安全な値に正規化する。
 */

export function parseMatch(value: string | undefined): WordMatchMode {
  return value === "contains" ? "contains" : value === "suffix" ? "suffix" : "prefix";
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
  if (opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs.length > 0 ? `/words?${qs}` : "/words";
}

/** 掲載箇所ビューから単語詳細へ渡す絞り込みコンテキスト。 */
export type WordDetailOccurrenceContext = {
  occ: string;
  q?: string;
  match: WordMatchMode;
  from?: string;
  to?: string;
  order: OccurrenceNumberOrder;
};

/**
 * 掲載箇所コンテキスト付きの単語詳細 URL を構築する。
 * buildWordsHref と同じ方針でデフォルト値（match=prefix / order=asc / 空値）は URL に含めない。
 */
export function buildWordDetailHref(wordId: string, ctx: WordDetailOccurrenceContext): string {
  const params = new URLSearchParams();
  params.set("occ", ctx.occ);
  if (ctx.q && ctx.q.length > 0) params.set("q", ctx.q);
  if (ctx.match !== "prefix") params.set("match", ctx.match);
  if (ctx.from) params.set("from", ctx.from);
  if (ctx.to) params.set("to", ctx.to);
  if (ctx.order !== "asc") params.set("order", ctx.order);
  return `/words/${wordId}?${params.toString()}`;
}
