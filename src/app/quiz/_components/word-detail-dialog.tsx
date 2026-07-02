"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WordDetailView } from "@/components/word-detail-view";
import type { WordDetail } from "@/lib/words-detail";
import type { AdjacentWordsResult } from "@/lib/words-list";

import { getAdjacentWordsForDialog, getWordDetailForDialog } from "../actions";

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
};

/** どの単語に対する応答かを wordId で持ち、render 側で鮮度を判定する。 */
type DetailResponse =
  | { wordId: string; ok: true; word: WordDetail }
  | { wordId: string; ok: false; message: string };

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; word: WordDetail };

/** どの単語×掲載箇所に対する応答かを key で持ち、render 側で鮮度を判定する。 */
type NavResponse = { key: string; nav: AdjacentWordsResult };

/**
 * 結果一覧の単語タップで `/words/[id]` と同等の内容を表示するフルスクリーンダイアログ。
 * 表示専用（編集導線なし）。詳細データは表示単語が変わるたび（開いたとき・関連語をたどったとき）に取得する。
 * 関連語タップはページ遷移せず `onSelectRelated` でダイアログ内の表示単語を切り替える。
 * `occurrenceId` が渡されたときは、掲載箇所全体を掲載番号順に前後移動するナビを
 * 詳細ページ（AdjacentWordNav）と同じくコンテンツ上部に出す
 * （掲載番号なしの単語ではナビ対象外として表示しない）。
 */
export function WordDetailDialog({
  wordId,
  onClose,
  onSelectRelated,
  occurrenceId = null,
  onNavigate,
}: Props) {
  const [response, setResponse] = useState<DetailResponse | null>(null);
  const [navResponse, setNavResponse] = useState<NavResponse | null>(null);
  // 関連語をたどって表示単語が切り替わったとき、前の単語のスクロール位置を引き継がないよう先頭へ戻す
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wordId === null) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [wordId]);

  useEffect(() => {
    if (wordId === null) return;
    let cancelled = false;
    void getWordDetailForDialog(wordId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setResponse({ wordId, ok: true, word: result.word });
      } else {
        setResponse({ wordId, ok: false, message: result.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [wordId]);

  useEffect(() => {
    if (wordId === null || occurrenceId === null) return;
    let cancelled = false;
    void getAdjacentWordsForDialog({ occurrenceId, wordId }).then((result) => {
      if (cancelled) return;
      // エラー時はナビを出さないだけ（詳細表示は response 側で生きる）
      setNavResponse({ key: `${occurrenceId}:${wordId}`, nav: result.ok ? result.nav : null });
    });
    return () => {
      cancelled = true;
    };
  }, [wordId, occurrenceId]);

  const state: DetailState =
    response === null || response.wordId !== wordId
      ? { status: "loading" }
      : response.ok
        ? { status: "ready", word: response.word }
        : { status: "error", message: response.message };

  const nav =
    occurrenceId !== null && navResponse !== null && navResponse.key === `${occurrenceId}:${wordId}`
      ? navResponse.nav
      : null;

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
          {/* 詳細ページ（AdjacentWordNav）と同じ位置・見た目。右は ✕（absolute top-2 right-2）を避ける */}
          {nav !== null && onNavigate !== undefined ? (
            <nav
              aria-label="前後の単語"
              className="flex items-center justify-between gap-2 px-4 pt-4 pr-14 md:pr-4"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={nav.prev === null}
                onClick={() => nav.prev !== null && onNavigate(nav.prev.id)}
              >
                <ChevronLeftIcon />
                前へ
              </Button>
              <span className="text-muted-foreground text-sm tabular-nums">
                {nav.current.occurrenceNumber !== null ? `No.${nav.current.occurrenceNumber}` : "—"}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={nav.next === null}
                onClick={() => nav.next !== null && onNavigate(nav.next.id)}
              >
                次へ
                <ChevronRightIcon />
              </Button>
            </nav>
          ) : null}
          {state.status === "loading" ? (
            <p className="text-muted-foreground px-4 pt-6 text-sm">読み込み中…</p>
          ) : state.status === "error" ? (
            <p className="text-destructive px-4 pt-6 text-sm" role="alert">
              {state.message}
            </p>
          ) : (
            <WordDetailView word={state.word} onSelectRelated={onSelectRelated} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
