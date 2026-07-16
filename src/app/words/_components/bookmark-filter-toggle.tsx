"use client";

import { BookmarkIcon } from "lucide-react";

import { Toggle } from "@/components/ui/toggle";

type Props = {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
};

/**
 * 一覧を「ブックマークのみ」に絞り込む toolbar トグル。
 * WordView / OccurrenceView 両方の toolbar で使い回す（URL param `bookmarked=1` は呼び出し側が制御）。
 */
export function BookmarkFilterToggle({ pressed, onPressedChange }: Props) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={pressed}
      onPressedChange={onPressedChange}
      aria-label="ブックマークのみ"
    >
      <BookmarkIcon fill={pressed ? "currentColor" : "none"} />
      ブックマークのみ
    </Toggle>
  );
}
