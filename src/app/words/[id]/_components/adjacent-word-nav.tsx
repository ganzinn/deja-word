"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { useSwipeNav } from "@/components/use-swipe-nav";
import { cn } from "@/lib/utils";

/**
 * 掲載箇所コンテキストで開いた単語詳細の前後ナビ。
 * 一覧（掲載番号順）の並びに沿って前後の単語詳細へ遷移する。端では無効表示。
 * ボタン押下に加えて、画面の横フリックでも同じ遷移をする（ADR-0085）。
 */
export function AdjacentWordNav({
  prevHref,
  nextHref,
  centerLabel,
}: {
  prevHref: string | null;
  nextHref: string | null;
  centerLabel: string;
}) {
  const router = useRouter();
  useSwipeNav({
    onPrev: prevHref !== null ? () => router.push(prevHref) : null,
    onNext: nextHref !== null ? () => router.push(nextHref) : null,
  });

  return (
    <nav aria-label="前後の単語" className="flex items-center justify-between gap-2 px-4 pt-4">
      {prevHref !== null ? (
        <Link href={prevHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
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
      <span className="text-muted-foreground text-sm tabular-nums">{centerLabel}</span>
      {nextHref !== null ? (
        <Link href={nextHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
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
