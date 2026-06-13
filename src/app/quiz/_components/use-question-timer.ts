"use client";

import { useEffect, useRef, useState } from "react";

/** 残り時間の表示用スナップショット。 */
export type QuestionTimerState = {
  /** 1（開始）→ 0（時間切れ）。 */
  remainingRatio: number;
  /** 残り秒数（切り上げ）。 */
  remainingSeconds: number;
};

/** 期限と現在時刻からスナップショットを計算する純関数。 */
export function remainingOf(deadline: number, now: number, timeoutMs: number): QuestionTimerState {
  const remainingMs = Math.min(timeoutMs, Math.max(0, deadline - now));
  return {
    remainingRatio: remainingMs / timeoutMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
  };
}

type Input = {
  /** null = 制限なし（タイマーを動かさず null を返す）。 */
  timeoutSeconds: number | null;
  /** 回答確定・解答表示で true にするとタイマー停止（表示は停止時点で凍結）。 */
  stopped: boolean;
  /** 期限到達時に 1 回だけ呼ばれる。 */
  onTimeout: () => void;
};

/**
 * 1 問分の残り時間タイマー。マウント時に期限（実時間）を確定し、
 * requestAnimationFrame で残りを更新する。バックグラウンドタブで
 * フレームが止まっても、復帰時に実時間で判定するため期限はずれない。
 * 問題ごとのリセットは呼び出し側の key リマウントに任せる。
 */
export function useQuestionTimer({
  timeoutSeconds,
  stopped,
  onTimeout,
}: Input): QuestionTimerState | null {
  const timeoutMs = timeoutSeconds === null ? null : timeoutSeconds * 1000;
  const deadlineRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  const [state, setState] = useState<QuestionTimerState | null>(
    timeoutSeconds === null ? null : { remainingRatio: 1, remainingSeconds: timeoutSeconds },
  );

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (timeoutMs === null || stopped) return;
    // 期限はマウント後最初の effect で 1 回だけ確定する
    deadlineRef.current ??= performance.now() + timeoutMs;
    const deadline = deadlineRef.current;
    let rafId: number;
    const tick = () => {
      const now = performance.now();
      setState(remainingOf(deadline, now, timeoutMs));
      if (now >= deadline) {
        if (!firedRef.current) {
          firedRef.current = true;
          onTimeoutRef.current();
        }
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [timeoutMs, stopped]);

  return state;
}
