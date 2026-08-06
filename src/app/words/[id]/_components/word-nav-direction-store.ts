"use client";

import type { WordNavDirection } from "@/components/word-content-transition-classes";

/**
 * 単語詳細ページの前後ナビで「どちら向きに移動したか」を遷移をまたいで受け渡す store。
 *
 * ページ遷移では前後ナビの操作元（旧ページ）と演出を出す側（新ページ）が別レンダーになるため、
 * React の state では方向を運べない。クライアントのモジュールスコープに 1 件だけ保持し、
 * 遷移先が「自分宛て」だと確認できたときにだけ消費する。
 *
 * 遷移先 URL（`buildWordDetailHref` の出力そのもの）を鍵にすることで、
 * 直接 URL アクセス・ブラウザの戻る/進む・リロードでは方向なし（＝スライドなし）になる。
 * リロードではモジュールごと作り直されるため、そもそも保持内容が残らない。
 */

type NavDirectionEntry = { href: string; direction: WordNavDirection };

let pending: NavDirectionEntry | null = null;

/** 前後ナビ操作の直前に、遷移先 href と向きを記録する。保持するのは常に最新の 1 件だけ。 */
export function setNavDirection(href: string, direction: WordNavDirection): void {
  pending = { href, direction };
}

/**
 * 現在の URL が記録された遷移先と一致していれば、その向きを返して記録を消す（消費）。
 * 一致しなければ null を返し、記録はそのまま残す（次の `setNavDirection` で上書きされる）。
 */
export function consumeNavDirection(currentHref: string): WordNavDirection | null {
  if (pending === null || pending.href !== currentHref) return null;
  const { direction } = pending;
  pending = null;
  return direction;
}
