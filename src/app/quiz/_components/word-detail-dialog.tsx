"use client";

import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WordDetailView } from "@/components/word-detail-view";
import type { WordDetail } from "@/lib/words-detail";

import { getWordDetailForDialog } from "../actions";

type Props = {
  /** 表示する単語 ID。null なら閉じる。 */
  wordId: string | null;
  onClose: () => void;
};

/** どの単語に対する応答かを wordId で持ち、render 側で鮮度を判定する。 */
type DetailResponse =
  | { wordId: string; ok: true; word: WordDetail }
  | { wordId: string; ok: false; message: string };

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; word: WordDetail };

/**
 * 結果一覧の単語タップで `/words/[id]` と同等の内容を表示するフルスクリーンダイアログ。
 * 表示専用（編集導線なし）。詳細データはダイアログを開いたときに取得する。
 */
export function WordDetailDialog({ wordId, onClose }: Props) {
  const [response, setResponse] = useState<DetailResponse | null>(null);

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

  const state: DetailState =
    response === null || response.wordId !== wordId
      ? { status: "loading" }
      : response.ok
        ? { status: "ready", word: response.word }
        : { status: "error", message: response.message };

  return (
    <Dialog
      open={wordId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="top-0 left-0 block h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none p-0 sm:max-w-none">
        <DialogTitle className="sr-only">単語の詳細</DialogTitle>
        <div className="mx-auto w-full max-w-sm pb-16 md:max-w-2xl">
          {state.status === "loading" ? (
            <p className="text-muted-foreground px-4 pt-6 text-sm">読み込み中…</p>
          ) : state.status === "error" ? (
            <p className="text-destructive px-4 pt-6 text-sm" role="alert">
              {state.message}
            </p>
          ) : (
            <WordDetailView word={state.word} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
