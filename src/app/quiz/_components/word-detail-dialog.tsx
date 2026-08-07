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

import { getWordDetailForDialog } from "../actions";
import {
  resolveDetailView,
  resolveDialogNav,
  resolveOccurrenceNumber,
  resolvePrefetchTargets,
  type DetailCache,
  type DetailResponse,
  type LastReadyDetail,
} from "./word-detail-dialog-state";

type Props = {
  /** 表示する単語 ID。null なら閉じる。 */
  wordId: string | null;
  onClose: () => void;
  /** 関連語タップ時のコールバック。ダイアログ内で表示単語を切り替えるために呼ばれる。 */
  onSelectRelated: (wordId: string) => void;
  /**
   * 前後ナビの順序（結果一覧の表示行スナップショットの wordId 配列）。
   * null / 未指定ならナビを表示しない（出題中・関連語スタック先）。
   */
  navOrder?: string[] | null;
  /** 見出し語右の #N の導出に使う基準掲載箇所 ID。null / 未指定なら #N を出さない。 */
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

/**
 * 結果一覧の単語タップで `/words/[id]` と同等の内容を表示するフルスクリーンダイアログ。
 * 表示専用（編集導線なし）。詳細データは表示単語が変わるたび（開いたとき・関連語をたどったとき）に取得する。
 * 関連語タップはページ遷移せず `onSelectRelated` でダイアログ内の表示単語を切り替える。
 * `navOrder` が渡されたときは、結果一覧に並んでいる順で前後移動するナビを
 * 詳細ページ（AdjacentWordNav）と同じくコンテンツ上部に出す。隣接は配列 index の同期導出のため
 * ナビ行は開いた瞬間から確定表示し、削除済み単語のエラービュー表示中も前後移動できる。
 * 見出し語右の #N は詳細応答の掲載箇所一覧から `occurrenceId` に一致する行を引いて出す
 * （ブックマーク全件モード等で一致が無ければ #N なし。ナビとは独立）。
 *
 * 前後移動中は前の単語を残したまま淡色化して待ち、到着時に方向スライドで差し替える
 * （詳細ページと同じ文法。`WordContentTransition`）。あわせて開いている間だけ有効なキャッシュへ
 * `navOrder` 上の前後 1 件の詳細を先読みし、待ち時間そのものを縮める。キャッシュは閉じたときに破棄する。
 */
export function WordDetailDialog({
  wordId,
  onClose,
  onSelectRelated,
  navOrder = null,
  occurrenceId = null,
  onNavigate,
  onBookmarkChange,
}: Props) {
  const [response, setResponse] = useState<DetailResponse | null>(null);
  // 前後ナビ操作の方向。到着時のスライド向きに使う。ナビ以外の切替（関連語・再オープン）は null。
  const [direction, setDirection] = useState<WordNavDirection | null>(null);
  // 開いている間だけ有効なキャッシュ（上限なし）。先読み応答はここにだけ書き、
  // 表示 state（response）には触れない＝応答の鮮度照合と干渉しない。
  const [detailCache, setDetailCache] = useState<DetailCache>(EMPTY_DETAIL_CACHE);
  // 応答待ちの間に淡色化して見せる直前の表示内容。
  const [lastReady, setLastReady] = useState<LastReadyDetail | null>(null);
  // 発行中の先読みキー。同じ取得を重ねて投げないためのガード（応答が返るたびに自分で消える）。
  const prefetchingRef = useRef(new Set<string>());
  // 関連語をたどって表示単語が切り替わったとき、前の単語のスクロール位置を引き継がないよう先頭へ戻す
  const scrollRef = useRef<HTMLDivElement>(null);

  // 閉じたらキャッシュと保持内容を破棄する（次に開いたときは初回ロードからやり直す）。
  // 閉じた後に届いた応答が書き戻したときも、その再レンダーでここが再び掃除する。
  if (wordId === null && (detailCache.size > 0 || lastReady !== null || direction !== null)) {
    setDetailCache(EMPTY_DETAIL_CACHE);
    setLastReady(null);
    setDirection(null);
  }

  const view = resolveDetailView({ wordId, response, lastReady, detailCache });
  const navView = resolveDialogNav(navOrder, wordId);

  // 未取得なら取りに行く（キャッシュに入った時点で null になり、取得は投げ直されない）。
  const detailFetchWordId = wordId !== null && !detailCache.has(wordId) ? wordId : null;

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

  // 表示中の単語の詳細が settle したら、navOrder 上の前後 1 件の詳細を先読みしてキャッシュにだけ入れる。
  // エラー応答（削除済み等）はキャッシュしない（削除済みの隣へ移動するたび再取得が走るのは許容）。
  useEffect(() => {
    const targets = resolvePrefetchTargets({ navOrder, wordId, response, detailCache });
    const prefetching = prefetchingRef.current;
    for (const target of targets) {
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
    }
  }, [navOrder, wordId, response, detailCache]);

  // 表示中の単語が変わったときだけ先頭へ戻す（応答待ちで前の単語を見ている間は動かさない）。
  const shownWordId = view.kind === "ready" ? view.word.id : null;
  // 見出し語の右に出す掲載番号。表示中の詳細応答から導出するため、応答待ちで前の単語を
  // 残している間に番号だけ先に進むことは構造的に起きない。
  const shownOccurrenceNumber =
    view.kind === "ready" ? resolveOccurrenceNumber(view.word, occurrenceId) : null;
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
    setDirection(targetDirection);
    commit();
  }

  // 遷移先（端では null）。ボタンと横フリックで同じ値を使う。
  const prevWordId = navView.visible ? navView.prevWordId : null;
  const nextWordId = navView.visible ? navView.nextWordId : null;
  const goPrev =
    prevWordId !== null ? () => switchTo("prev", () => onNavigate?.(prevWordId)) : null;
  const goNext =
    nextWordId !== null ? () => switchTo("next", () => onNavigate?.(nextWordId)) : null;
  // ナビを出しているときは横フリックでも前後移動できる（詳細ページと同じ操作、ADR-0085）。
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
              行の高さ（min-h-7 = icon-sm ボタン）は常に確保する。取得完了の瞬間に
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
              px-4（✕ は上のブックマーク行が高さを確保しているので避ける必要がない）。
              隣接は配列 index で同期的に決まるため、開いた瞬間から確定表示する（端だけ disabled） */}
          {navView.visible ? (
            <nav aria-label="前後の単語" className="flex items-center justify-end gap-2 px-4 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={navView.prevWordId === null}
                onClick={() => goPrev?.()}
              >
                <ChevronLeftIcon />
                前へ
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={navView.nextWordId === null}
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
