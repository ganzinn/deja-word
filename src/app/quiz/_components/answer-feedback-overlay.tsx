"use client";

import { CircleCheckIcon, CircleXIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { QuizResult } from "@/generated/prisma/enums";

/** 正誤フラッシュの種別。null = 演出なし（GAVE_UP など中立の結果）。 */
export type FeedbackKind = "correct" | "incorrect";

/**
 * 解答結果を正誤フラッシュ／効果音の種別へ写像する。
 * CORRECT → ○（正解音）/ INCORRECT・TIMEOUT → ×（不正解音。時間切れは×と同じ扱い）/
 * GAVE_UP → null（わからない・思い浮かばなかったは表示も音もなし）。
 */
export function feedbackKindForResult(result: QuizResult): FeedbackKind | null {
  switch (result) {
    case "CORRECT":
      return "correct";
    case "INCORRECT":
    case "TIMEOUT":
      return "incorrect";
    case "GAVE_UP":
      return null;
  }
}

/** 表示中のフラッシュ。key は同種別の連続表示でもアニメを再生させるための再マウント用。 */
export type Feedback = { kind: FeedbackKind; key: number };

/**
 * 画面中央に ○ / × を一瞬フラッシュ表示する演出用オーバーレイ。
 * クリックは透過（pointer-events-none）し、読み上げは結果一覧が担うため aria-hidden。
 * アニメは reduce-motion 時には無効化（一瞬表示のみ）。
 */
export function AnswerFeedbackOverlay({ feedback }: { feedback: Feedback | null }) {
  if (feedback === null) return null;
  const isCorrect = feedback.kind === "correct";
  const Icon = isCorrect ? CircleCheckIcon : CircleXIcon;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
    >
      <Icon
        key={feedback.key}
        strokeWidth={2.5}
        className={cn(
          "size-40 drop-shadow-lg",
          "motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in motion-safe:duration-200",
          isCorrect
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400",
        )}
      />
    </div>
  );
}
