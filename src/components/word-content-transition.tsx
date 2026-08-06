"use client";

import { cn } from "@/lib/utils";
import { slideInClass, type WordNavDirection } from "./word-content-transition-classes";

/**
 * 単語の前後ナビ（ページ／ダイアログ共通）の遷移中フィードバック表示。
 *
 * 遷移中はスピナーに差し替えず「前の単語を残したまま淡色化」する（待ちがほぼ無ければ実質見えない）。
 * 新しい単語が届いたら `contentKey` の変化で中身を再マウントし、方向に応じたスライドで進入させる。
 * 旧コンテンツの退場アニメーションは持たない（差し替え時に消えるだけ）。
 *
 * pending の検知はページ／ダイアログそれぞれの事情（`useLinkStatus` / 自前の読み込み状態）が違うため
 * ここでは行わず、呼び出し側から props で受け取る。
 */
export function WordContentTransition({
  pending,
  direction,
  contentKey,
  children,
}: {
  /** 次の単語を取得中か。true の間コンテンツを淡色化する。 */
  pending: boolean;
  /** 進入方向。null なら演出なし（初回表示・方向が特定できない遷移）。 */
  direction: WordNavDirection | null;
  /** この値が変わったら新しい単語が届いたとみなし、中身を再マウントしてスライドさせる。 */
  contentKey: string;
  children: React.ReactNode;
}) {
  return (
    <div
      // E2E から遷移中フィードバックを観測するための属性（値が無い状態は属性ごと出さない）
      data-pending={pending ? "true" : undefined}
      data-direction={direction ?? undefined}
      // スライドで一時的に右（左）へはみ出す分を切る。clip なのでスクロール容器は作らず、
      // 縦スクロールや sticky の挙動は変えない。
      className={cn("overflow-x-clip transition-opacity duration-150", pending && "opacity-50")}
    >
      <div key={contentKey} className={slideInClass(direction)}>
        {children}
      </div>
    </div>
  );
}
