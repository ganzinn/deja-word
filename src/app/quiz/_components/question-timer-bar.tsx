"use client";

import { cn } from "@/lib/utils";

import type { QuestionTimerState } from "./use-question-timer";

/** バーを警告色に切り替える残り割合のしきい値。 */
const LOW_REMAINING_RATIO = 0.2;

type Props = {
  state: QuestionTimerState;
  /** タイムアウト確定後は秒数の代わりに「時間切れ」を出す。 */
  timedOut: boolean;
};

/** 1 問分の残り時間バー。問題進捗バー（quiz-flow）と同構造・別色で出題エリア内に置く。 */
export function QuestionTimerBar({ state, timedOut }: Props) {
  const percent = Math.max(0, Math.min(1, state.remainingRatio)) * 100;
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label="残り時間"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            "h-full rounded-full",
            state.remainingRatio <= LOW_REMAINING_RATIO ? "bg-destructive" : "bg-amber-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {timedOut ? (
        <span className="text-destructive shrink-0 text-sm font-medium">時間切れ</span>
      ) : (
        <span className="text-muted-foreground w-6 shrink-0 text-right text-sm tabular-nums">
          {state.remainingSeconds}
        </span>
      )}
    </div>
  );
}
