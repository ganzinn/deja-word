"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { WordContentTransition } from "@/components/word-content-transition";
import type { WordNavDirection } from "@/components/word-content-transition-classes";

import { AdjacentWordNav } from "./adjacent-word-nav";
import { consumeNavDirection, setNavDirection } from "./word-nav-direction-store";

/**
 * 単語詳細ページの前後ナビと本文をまとめるクライアント境界。
 *
 * ボタンも横フリックも `navigate` の 1 経路に集約し、
 * (1) 遷移先の向きを store へ記録 → (2) `startTransition` + `router.push` で遷移する。
 * 待ちの間は `isPending` で本文を淡色化し、到着後の新ページが store から向きを消費して
 * スライドで入場する（`WordContentTransition`）。
 *
 * 本文（`WordDetailView`）はサーバ描画のまま `children` として受け取り、クライアント化しない。
 */
export function WordNavArea({
  currentHref,
  prevHref,
  nextHref,
  centerLabel,
  wordId,
  children,
}: {
  /**
   * 表示中ページの URL。`buildWordDetailHref` の出力をそのまま渡す（store の鍵と同じ文字列にする）。
   * `usePathname` + `useSearchParams` から組み直すとクエリの順序・エスケープで食い違い得るため、
   * 遷移先 href を作るのと同じ関数の出力をサーバから受け取る。
   */
  currentHref: string;
  prevHref: string | null;
  nextHref: string | null;
  centerLabel: string;
  /** 表示中の単語 ID。到着（＝この値の変化）でスライドを再生する。 */
  wordId: string;
  /** サーバ描画の単語詳細本文。 */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 向きの消費は URL ごとに 1 回だけ。遷移でこのコンポーネントが再マウントされる場合は初期化子、
  // props だけ差し替わる場合は描画中の調整（React 公式の adjusting state during render）で拾う。
  const [consumed, setConsumed] = useState<{ href: string; direction: WordNavDirection | null }>(
    () => ({ href: currentHref, direction: consumeNavDirection(currentHref) }),
  );
  if (consumed.href !== currentHref) {
    setConsumed({ href: currentHref, direction: consumeNavDirection(currentHref) });
  }
  const direction = consumed.href === currentHref ? consumed.direction : null;

  /**
   * 前後ナビの唯一の遷移経路。多重操作はブロックせず最後勝ち（`isPending` は全遷移の完了まで true）。
   */
  function navigate(href: string, targetDirection: WordNavDirection) {
    setNavDirection(href, targetDirection);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <>
      <AdjacentWordNav
        prevHref={prevHref}
        nextHref={nextHref}
        centerLabel={centerLabel}
        navigate={navigate}
      />
      <WordContentTransition pending={isPending} direction={direction} contentKey={wordId}>
        {children}
      </WordContentTransition>
    </>
  );
}
