"use client";

import { InfoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  onClick: () => void;
};

/**
 * 出題中、解答が表示された後に見出し語（＝対象の英単語）の隣へ出す「単語の詳細を見る」ボタン。
 * 発音ボタン（`AudioPlayButton`）と並べて同じ寸法・variant に揃える。タップで QuizFlow の
 * 単語詳細ダイアログ（`WordDetailDialog`）を開く。
 */
export function WordDetailButton({ onClick }: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={onClick}
      aria-label="単語の詳細を見る"
    >
      <InfoIcon />
      <span>詳細</span>
    </Button>
  );
}
