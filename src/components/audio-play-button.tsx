"use client";

import { PlayIcon } from "lucide-react";

import { PronunciationToggle } from "@/components/pronunciation-toggle";
import { Button } from "@/components/ui/button";
import { usePronunciationPlayback } from "@/components/use-pronunciation-playback";

type AudioPlayButtonProps = {
  src: string | null | undefined;
  label: string;
  /**
   * 発音音源（`src`）が無いときに、端末内蔵の自動音声で読み上げる語（英単語）。
   * 自動音声フォールバック設定が ON のときだけ使われる。`src` があれば常に音源を優先する。
   */
  ttsText?: string | null;
  /**
   * `src` が無いとき、`null` を返す代わりに同じ寸法の不可視プレースホルダを描画する。
   * 一覧で発音ボタンの有無により隣のバッジ位置がズレるのを防ぐ用途（既定 false）。
   */
  reserveSpaceWhenEmpty?: boolean;
};

/**
 * 発音記号の隣に並べる小さな再生ボタン（一覧行・単語テスト・音源管理の「試聴」）。
 * click で play / 再 click で停止。再生制御は `usePronunciationPlayback`、見た目の
 * 描き分け（音源あり／自動音声）は `PronunciationToggle` が持つ。
 *
 * 単語詳細のカードはこれを使わず、カード全体をタップ領域にする `PronunciationCard` を使う
 * （小さなボタンがスマホで押しづらいため。ADR-0092）。
 *
 * 再生手段がまったく無ければ何も描画しない（`reserveSpaceWhenEmpty` 指定時は同寸の不可視
 * プレースホルダでスロットを確保する）。
 */
export function AudioPlayButton({
  src,
  label,
  ttsText,
  reserveSpaceWhenEmpty,
}: AudioPlayButtonProps) {
  const playback = usePronunciationPlayback({ src, ttsText });

  if (!playback.available) {
    if (!reserveSpaceWhenEmpty) return null;
    // 実ボタンと同じマークアップを visibility:hidden で描画し、幅・gap を温存する。
    // 非表示かつ非インタラクティブ（aria-hidden / tabIndex=-1 / onClick・audio なし）。
    return (
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="invisible"
        aria-hidden
        tabIndex={-1}
      >
        <PlayIcon />
        <span>{label}</span>
      </Button>
    );
  }

  return <PronunciationToggle playback={playback} label={label} />;
}
