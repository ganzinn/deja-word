"use client";

import { BookmarkIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { toggleBookmark } from "@/app/words/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BookmarkButtonProps = {
  wordId: string;
  /** 初期のブックマーク状態（サーバ供給値）。 */
  bookmarked: boolean;
  /** ボタンサイズ。導線ごとの寸法差を吸収する（既定 `icon-sm`）。 */
  size?: "icon-xs" | "icon-sm" | "icon";
  /**
   * 状態変更を親へ通知する（楽観的更新の確定・巻き戻しの両方で呼ぶ）。
   * 「ブックマークのみ」フィルタ中の一覧など、親が表示可否を追随する用途。
   */
  onBookmarkChange?: (bookmarked: boolean) => void;
};

/**
 * 苦手な単語にブックマークを付け外しする共有トグルボタン（4 導線で使い回す）。
 * 反映は楽観的更新: タップで即座に反転表示し、`toggleBookmark` が失敗したときのみ
 * 元に戻してエラー toast を出す（成功時は toast なし）。`router.refresh()` は呼ばない。
 * ON は青の塗りつぶし（TG 例文と同じ blue-500）、OFF はアウトライン。`aria-pressed` で状態を伝える。
 */
export function BookmarkButton({
  wordId,
  bookmarked,
  size = "icon-sm",
  onBookmarkChange,
}: BookmarkButtonProps) {
  const [current, setCurrent] = useState(bookmarked);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    // 目標状態を受け取る冪等な set。現在表示の反転を次状態とする。
    const next = !current;
    const prev = current;
    // 楽観的更新: 先に反転表示し、親へも通知する。
    setCurrent(next);
    onBookmarkChange?.(next);

    startTransition(async () => {
      const result = await toggleBookmark(wordId, next);
      if (!result.ok) {
        // 失敗時のみ巻き戻す。
        setCurrent(prev);
        onBookmarkChange?.(prev);
        toast.error(result.message);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={handleClick}
      disabled={isPending}
      aria-label="ブックマーク"
      aria-pressed={current}
    >
      <BookmarkIcon
        fill={current ? "currentColor" : "none"}
        className={cn(current && "text-blue-500")}
      />
    </Button>
  );
}

type RowBookmarkButtonProps = BookmarkButtonProps;

/**
 * クリックで行全体が遷移／展開する一覧の行内に置くブックマークボタン。
 * `row-audio-button.tsx` と同じ方式でイベント伝播を止め、行の Link 遷移や
 * onClick / onKeyDown を抑止する（`BookmarkButton` の onClick はバブル段階で
 * ラッパ到達前に実行されるため機能する）。
 * - onClick: preventDefault + stopPropagation で Link 遷移と行 onClick を抑止。
 * - onKeyDown: stopPropagation のみ（preventDefault するとボタン自身の Enter/Space 発火を
 *   潰すため付けない）。
 */
export function RowBookmarkButton(props: RowBookmarkButtonProps) {
  return (
    <span
      className="contents"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <BookmarkButton {...props} />
    </span>
  );
}
