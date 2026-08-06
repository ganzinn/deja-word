"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BookmarkButton } from "@/components/bookmark-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSwipeNav } from "@/components/use-swipe-nav";
import { WordContentTransition } from "@/components/word-content-transition";
import type { WordNavDirection } from "@/components/word-content-transition-classes";
import { WordDetailView } from "@/components/word-detail-view";

import { getAdjacentWordsForDialog, getWordDetailForDialog } from "../actions";
import {
  navCacheKey,
  resolveCurrentNav,
  resolveDetailView,
  resolveNavView,
  resolvePrefetchTargets,
  type DetailCache,
  type DetailResponse,
  type LastNav,
  type LastReadyDetail,
  type NavCache,
  type NavResponse,
} from "./word-detail-dialog-state";

type Props = {
  /** 表示する単語 ID。null なら閉じる。 */
  wordId: string | null;
  onClose: () => void;
  /** 関連語タップ時のコールバック。ダイアログ内で表示単語を切り替えるために呼ばれる。 */
  onSelectRelated: (wordId: string) => void;
  /** 前後ナビの基準となる掲載箇所 ID。null / 未指定ならナビを表示しない。 */
  occurrenceId?: string | null;
  /** 前後ナビ押下時のコールバック。表示単語を隣接単語へ差し替えるために呼ばれる。 */
  onNavigate?: (wordId: string) => void;
  /**
   * ヘッダのブックマークトグルの変更を親へ同期するコールバック。未指定でも成立する
   * （結果一覧の状態マップを持たない呼び出し元では、結果フェーズ入りの一括取得が反映する）。
   */
  onBookmarkChange?: (wordId: string, bookmarked: boolean) => void;
};

/** 閉じたときに戻す空キャッシュ（毎回新しい Map を作らないよう共有する。書き込みは常にコピー）。 */
const EMPTY_DETAIL_CACHE: DetailCache = new Map();
const EMPTY_NAV_CACHE: NavCache = new Map();

/**
 * 結果一覧の単語タップで `/words/[id]` と同等の内容を表示するフルスクリーンダイアログ。
 * 表示専用（編集導線なし）。詳細データは表示単語が変わるたび（開いたとき・関連語をたどったとき）に取得する。
 * 関連語タップはページ遷移せず `onSelectRelated` でダイアログ内の表示単語を切り替える。
 * `occurrenceId` が渡されたときは、掲載箇所全体を掲載番号順に前後移動するナビを
 * 詳細ページ（AdjacentWordNav）と同じくコンテンツ上部に出す
 * （掲載番号なしの単語ではナビ対象外として表示しない）。
 *
 * 前後移動中は前の単語を残したまま淡色化して待ち、到着時に方向スライドで差し替える
 * （詳細ページと同じ文法。`WordContentTransition`）。あわせて開いている間だけ有効なキャッシュへ
 * 前後 1 件を先読みし、待ち時間そのものを縮める。キャッシュは閉じたときに破棄する。
 */
export function WordDetailDialog({
  wordId,
  onClose,
  onSelectRelated,
  occurrenceId = null,
  onNavigate,
  onBookmarkChange,
}: Props) {
  const [response, setResponse] = useState<DetailResponse | null>(null);
  const [navResponse, setNavResponse] = useState<NavResponse | null>(null);
  // 前後ナビ操作の方向。到着時のスライド向きに使う。ナビ以外の切替（関連語・再オープン）は null。
  const [direction, setDirection] = useState<WordNavDirection | null>(null);
  // 開いている間だけ有効なキャッシュ（上限なし）。先読み応答はここにだけ書き、
  // 表示 state（response / navResponse）には触れない＝応答の鮮度照合と干渉しない。
  const [detailCache, setDetailCache] = useState<DetailCache>(EMPTY_DETAIL_CACHE);
  const [navCache, setNavCache] = useState<NavCache>(EMPTY_NAV_CACHE);
  // 応答待ちの間に淡色化して見せる直前の表示内容。
  const [lastReady, setLastReady] = useState<LastReadyDetail | null>(null);
  const [lastNav, setLastNav] = useState<LastNav | null>(null);
  // 発行中の先読みキー。同じ取得を重ねて投げないためのガード（応答が返るたびに自分で消える）。
  const prefetchingRef = useRef(new Set<string>());
  // 関連語をたどって表示単語が切り替わったとき、前の単語のスクロール位置を引き継がないよう先頭へ戻す
  const scrollRef = useRef<HTMLDivElement>(null);

  // 閉じたらキャッシュと保持内容を破棄する（次に開いたときは初回ロードからやり直す）。
  // 閉じた後に届いた応答が書き戻したときも、その再レンダーでここが再び掃除する。
  if (
    wordId === null &&
    (detailCache.size > 0 ||
      navCache.size > 0 ||
      lastReady !== null ||
      lastNav !== null ||
      direction !== null)
  ) {
    setDetailCache(EMPTY_DETAIL_CACHE);
    setNavCache(EMPTY_NAV_CACHE);
    setLastReady(null);
    setLastNav(null);
    setDirection(null);
  }

  const view = resolveDetailView({ wordId, response, lastReady, detailCache });
  const currentNav = resolveCurrentNav({ wordId, occurrenceId, navResponse, navCache });
  const navView = resolveNavView({
    wordId,
    occurrenceId,
    canNavigate: onNavigate !== undefined,
    navResponse,
    lastNav,
    navCache,
  });

  // 未取得なら取りに行く（キャッシュに入った時点で null になり、取得は投げ直されない）。
  const detailFetchWordId = wordId !== null && !detailCache.has(wordId) ? wordId : null;
  const navFetchWordId =
    wordId !== null && occurrenceId !== null && !navCache.has(navCacheKey(occurrenceId, wordId))
      ? wordId
      : null;

  useEffect(() => {
    if (detailFetchWordId === null) return;
    let cancelled = false;
    void getWordDetailForDialog(detailFetchWordId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        const entry = { word: result.word, bookmarked: result.bookmarked };
        setDetailCache((prev) => new Map(prev).set(detailFetchWordId, entry));
        setResponse({ wordId: detailFetchWordId, ok: true, ...entry });
      } else {
        setResponse({ wordId: detailFetchWordId, ok: false, message: result.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [detailFetchWordId]);

  useEffect(() => {
    if (navFetchWordId === null || occurrenceId === null) return;
    const key = navCacheKey(occurrenceId, navFetchWordId);
    let cancelled = false;
    void getAdjacentWordsForDialog({ occurrenceId, wordId: navFetchWordId }).then((result) => {
      if (cancelled) return;
      // エラー時はナビを出さないだけ（詳細表示は response 側で生きる）。キャッシュには入れない。
      if (result.ok) setNavCache((prev) => new Map(prev).set(key, result.nav));
      setNavResponse({ key, nav: result.ok ? result.nav : null });
    });
    return () => {
      cancelled = true;
    };
  }, [navFetchWordId, occurrenceId]);

  // 表示中の単語が settle したら、前後 1 件の詳細・隣接を先読みしてキャッシュにだけ入れる。
  useEffect(() => {
    const targets = resolvePrefetchTargets({
      wordId,
      occurrenceId,
      response,
      navResponse,
      detailCache,
      navCache,
    });
    const prefetching = prefetchingRef.current;
    for (const target of targets) {
      if (target.kind === "detail") {
        const key = `detail:${target.wordId}`;
        if (prefetching.has(key)) continue;
        prefetching.add(key);
        void getWordDetailForDialog(target.wordId).then((result) => {
          prefetching.delete(key);
          if (!result.ok) return;
          setDetailCache((prev) =>
            new Map(prev).set(target.wordId, {
              word: result.word,
              bookmarked: result.bookmarked,
            }),
          );
        });
      } else {
        const cacheKey = navCacheKey(target.occurrenceId, target.wordId);
        const key = `adjacent:${cacheKey}`;
        if (prefetching.has(key)) continue;
        prefetching.add(key);
        void getAdjacentWordsForDialog({
          occurrenceId: target.occurrenceId,
          wordId: target.wordId,
        }).then((result) => {
          prefetching.delete(key);
          if (!result.ok) return;
          setNavCache((prev) => new Map(prev).set(cacheKey, result.nav));
        });
      }
    }
  }, [wordId, occurrenceId, response, navResponse, detailCache, navCache]);

  // 表示中の単語が変わったときだけ先頭へ戻す（応答待ちで前の単語を見ている間は動かさない）。
  const shownWordId = view.kind === "ready" ? view.word.id : null;
  // 見出し語の右に出す掲載番号。ナビの遷移先（`currentNav`）ではなく「今表示している単語」の
  // 隣接応答から引く。応答待ちで前の単語を残している間に番号だけ先に進むのを防ぐため。
  const shownOccurrenceNumber =
    resolveCurrentNav({ wordId: shownWordId, occurrenceId, navResponse, navCache })?.current
      .occurrenceNumber ?? null;
  useEffect(() => {
    if (shownWordId === null) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [shownWordId]);

  /**
   * 表示単語の切り替え（`commit` が親へ通知する）。今表示している内容を「直前の内容」として
   * 持ち越してから切り替えることで、次の単語が届くまでの間それを淡色化して見せる。
   * キャッシュヒットで取得が走らない場合も含め、切替の起点はここだけなので持ち越しもここで足りる。
   * `direction` が null の切替（関連語）はスライドさせない。
   */
  function switchTo(targetDirection: WordNavDirection | null, commit: () => void) {
    if (view.kind === "ready") {
      setLastReady({ wordId: view.word.id, word: view.word, bookmarked: view.bookmarked });
    }
    if (currentNav !== undefined && currentNav !== null) setLastNav(currentNav);
    setDirection(targetDirection);
    commit();
  }

  // 遷移先（応答待ち・端では null）。ボタンと横フリックで同じ値を使う。
  const prevWordId = navView.visible ? navView.prevWordId : null;
  const nextWordId = navView.visible ? navView.nextWordId : null;
  const goPrev =
    prevWordId !== null ? () => switchTo("prev", () => onNavigate?.(prevWordId)) : null;
  const goNext =
    nextWordId !== null ? () => switchTo("next", () => onNavigate?.(nextWordId)) : null;
  // ナビを出しているときは横フリックでも前後移動できる（詳細ページと同じ操作、ADR-0085）。
  // 隣接応答待ちの間は遷移先が定まらないため、ボタンの disabled と同じく無効になる。
  useSwipeNav({ onPrev: goPrev, onNext: goNext });

  return (
    <Dialog
      open={wordId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        ref={scrollRef}
        className="top-0 left-0 block h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">単語の詳細</DialogTitle>
        <div className="mx-auto w-full max-w-sm pb-16 md:max-w-2xl">
          {/* ヘッダのブックマークトグル。出題中・結果一覧のどちらから開いても同じ位置（右上、✕ の左）に出す。
              初期値はサーバ供給（getWordDetailForDialog の bookmarked）のため取得完了後のみ描画するが、
              行の高さ（min-h-7 = icon-sm ボタン）は常に確保する。詳細より隣接応答が先に届いた瞬間に
              下のナビ行がここまでせり上がると ✕（absolute top-2 right-2）と重なるため。 */}
          <div className="flex min-h-7 justify-end px-4 pt-4 pr-14 md:pr-4">
            {view.kind === "ready" ? (
              <BookmarkButton
                key={view.word.id}
                wordId={view.word.id}
                bookmarked={view.bookmarked}
                onBookmarkChange={(next) => {
                  const id = view.word.id;
                  // 前後移動で戻ってきたときに古い状態を見せないよう、キャッシュ側も合わせる。
                  setDetailCache((prev) => {
                    const cached = prev.get(id);
                    if (cached === undefined) return prev;
                    return new Map(prev).set(id, { ...cached, bookmarked: next });
                  });
                  onBookmarkChange?.(id, next);
                }}
              />
            ) : null}
          </div>
          {/* 詳細ページ（AdjacentWordNav）と同じ位置・見た目（本文の上・右詰め）。右端は本文と同じ
              px-4（✕ は上のブックマーク行が高さを確保しているので避ける必要がない）。応答待ちの間も
              行は消さず（消滅→再出現はレイアウトシフトになる）、ボタンだけ disabled にする */}
          {navView.visible ? (
            <nav aria-label="前後の単語" className="flex items-center justify-end gap-2 px-4 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={navView.prevDisabled}
                onClick={() => goPrev?.()}
              >
                <ChevronLeftIcon />
                前へ
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={navView.nextDisabled}
                onClick={() => goNext?.()}
              >
                次へ
                <ChevronRightIcon />
              </Button>
            </nav>
          ) : null}
          {view.kind === "initial-loading" ? (
            <p className="text-muted-foreground px-4 pt-6 text-sm">読み込み中…</p>
          ) : view.kind === "error" ? (
            <p className="text-destructive px-4 pt-6 text-sm" role="alert">
              {view.message}
            </p>
          ) : (
            <WordContentTransition
              pending={view.pending}
              direction={direction}
              // 到着（表示中の単語が入れ替わった瞬間）にスライドさせたいので、
              // 要求中の wordId ではなく表示中の単語 ID を key にする。
              contentKey={view.word.id}
            >
              {/* 関連語タップは前後ナビではないのでスライドさせない（方向 null） */}
              <WordDetailView
                word={view.word}
                occurrenceNumber={shownOccurrenceNumber}
                onSelectRelated={(relatedId) => switchTo(null, () => onSelectRelated(relatedId))}
              />
            </WordContentTransition>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
