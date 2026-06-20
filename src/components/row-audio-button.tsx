"use client";

import { AudioPlayButton } from "@/components/audio-play-button";

type RowAudioButtonProps = {
  src: string | null | undefined;
  label: string;
};

/**
 * クリックで行全体が遷移／展開する一覧の行内に置く発音ボタン。
 * ラッパで preventDefault + stopPropagation し、行の Link 遷移や onClick を抑止する
 * （`AudioPlayButton` の再生はバブル段階でラッパ到達前に実行されるため機能する）。
 * `src` が無ければ `AudioPlayButton` が何も描画しない。
 */
export function RowAudioButton({ src, label }: RowAudioButtonProps) {
  return (
    <span
      className="contents"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <AudioPlayButton src={src} label={label} />
    </span>
  );
}
