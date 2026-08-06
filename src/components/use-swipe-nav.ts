"use client";

import { useEffect, useRef } from "react";

/**
 * フリック判定の最小横移動量(px)。タップのブレや縦スクロールの巻き込みで誤発火しない程度に取る。
 */
const MIN_DISTANCE_PX = 60;
/**
 * 縦移動に対して横移動が何倍あればフリックとみなすか。縦スクロール中の斜めブレを弾く。
 */
const MIN_HORIZONTAL_RATIO = 2;
/**
 * 画面左右端からこの幅(px)で始まったタッチは無視する。OS / ブラウザの戻る・進むジェスチャと
 * 二重に反応する（戻ると同時に前の単語へ移動する）のを避けるため。
 */
const EDGE_MARGIN_PX = 24;

export type SwipeNavDirection = "prev" | "next";

/**
 * タッチの移動量から前後ナビの方向を決める。左フリック（指を左へ）で次、右フリックで前。
 * 判定条件を満たさなければ null（何もしない）。
 */
export function resolveSwipeNavDirection(dx: number, dy: number): SwipeNavDirection | null {
  if (Math.abs(dx) < MIN_DISTANCE_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * MIN_HORIZONTAL_RATIO) return null;
  return dx > 0 ? "prev" : "next";
}

type SwipeNavHandlers = {
  /** 右フリック時の遷移。端（前が無い）なら null。 */
  onPrev: (() => void) | null;
  /** 左フリック時の遷移。端（次が無い）なら null。 */
  onNext: (() => void) | null;
};

/**
 * 画面全体の横フリックで前後ナビを起こす。前後ナビ（「前へ」「次へ」）を出している画面が使う。
 *
 * リスナを個別の要素ではなく window に張るのは、前後移動が画面単位の操作で、
 * 詳細ページとダイアログでスクロール容器（ページ / DialogContent）が違うため。
 * `onPrev` / `onNext` が両方 null（ナビ非表示・両端）のときは何も張らない。
 */
export function useSwipeNav({ onPrev, onNext }: SwipeNavHandlers): void {
  // 最新のハンドラを ref 経由で読む。ジェスチャ中の再レンダーでリスナを張り替えると
  // 記録済みの開始位置が失われ、フリックが取りこぼされるため。
  const handlersRef = useRef<SwipeNavHandlers>({ onPrev, onNext });
  useEffect(() => {
    handlersRef.current = { onPrev, onNext };
  });

  const enabled = onPrev !== null || onNext !== null;
  useEffect(() => {
    if (!enabled) return;

    let start: { x: number; y: number } | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches.length === 1 ? e.touches.item(0) : null;
      // マルチタッチ（ピンチズーム等）と画面端始まりは対象外
      if (
        touch === null ||
        touch.clientX < EDGE_MARGIN_PX ||
        touch.clientX > window.innerWidth - EDGE_MARGIN_PX
      ) {
        start = null;
        return;
      }
      start = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const from = start;
      start = null;
      const touch = e.changedTouches.item(0);
      if (from === null || touch === null) return;
      const direction = resolveSwipeNavDirection(touch.clientX - from.x, touch.clientY - from.y);
      if (direction === "prev") handlersRef.current.onPrev?.();
      else if (direction === "next") handlersRef.current.onNext?.();
    };

    const handleTouchCancel = () => {
      start = null;
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [enabled]);
}
