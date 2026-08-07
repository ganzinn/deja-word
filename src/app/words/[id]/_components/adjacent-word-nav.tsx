"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { WordNavDirection } from "@/components/word-content-transition-classes";
import { useSwipeNav } from "@/components/use-swipe-nav";
import { cn } from "@/lib/utils";

/**
 * 掲載箇所コンテキストで開いた単語詳細の前後ナビ（本文の上）。
 * 一覧（掲載番号順）の並びに沿って前後の単語詳細へ遷移する。端では無効表示。
 * 掲載番号は本文の見出し語の右（`WordDetailView` の `#N`）に出すため、ここには持たない。
 * 中央ラベルが無くなったので 2 ボタンは右詰めにする（左端に「前へ」が孤立して見えるため）。
 * ボタン押下に加えて、画面の横フリックでも同じ遷移をする（ADR-0085）。
 *
 * 遷移そのものは行わず、親（`WordNavArea`）の `navigate` に委ねる。遷移中フィードバックのため
 * 「向きの記録」と「`startTransition` での遷移」を 1 経路に集約する必要があるため。
 */
export function AdjacentWordNav({
  prevHref,
  nextHref,
  navigate,
}: {
  prevHref: string | null;
  nextHref: string | null;
  navigate: (href: string, direction: WordNavDirection) => void;
}) {
  useSwipeNav({
    onPrev: prevHref !== null ? () => navigate(prevHref, "prev") : null,
    onNext: nextHref !== null ? () => navigate(nextHref, "next") : null,
  });

  return (
    <nav aria-label="前後の単語" className="flex items-center justify-end gap-2 px-4 pt-4">
      {prevHref !== null ? (
        <Link
          href={prevHref}
          // 先読みはしない（毎回サーバー取得にして、一覧の表示順と常に同期した隣接移動にする。ADR-0090）。
          // `<Link>` は anchor semantics と `onNavigate` intercept のために維持する。
          prefetch={false}
          // クライアント遷移のときだけ呼ばれる。修飾キー付きクリック・新規タブは通常のリンクのまま。
          onNavigate={(e) => {
            e.preventDefault();
            navigate(prevHref, "prev");
          }}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ChevronLeftIcon />
          前へ
        </Link>
      ) : (
        <span
          aria-disabled
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "pointer-events-none opacity-50",
          )}
        >
          <ChevronLeftIcon />
          前へ
        </span>
      )}
      {nextHref !== null ? (
        <Link
          href={nextHref}
          prefetch={false}
          onNavigate={(e) => {
            e.preventDefault();
            navigate(nextHref, "next");
          }}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          次へ
          <ChevronRightIcon />
        </Link>
      ) : (
        <span
          aria-disabled
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "pointer-events-none opacity-50",
          )}
        >
          次へ
          <ChevronRightIcon />
        </span>
      )}
    </nav>
  );
}
