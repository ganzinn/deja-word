"use client";

import { AudioPlayButton } from "@/components/audio-play-button";

type RowAudioButtonProps = {
  src: string | null | undefined;
  label: string;
};

/**
 * クリックで行全体が遷移／展開する一覧の行内に置く発音ボタン。
 * ラッパでイベント伝播を止め、行の Link 遷移や onClick / onKeyDown を抑止する
 * （`AudioPlayButton` の再生はバブル段階でラッパ到達前に実行されるため機能する）。
 * - onClick: preventDefault + stopPropagation で Link 遷移と行 onClick を抑止。
 * - onKeyDown: stopPropagation のみ（preventDefault するとボタン自身の Enter/Space 発火を
 *   潰すため付けない）。これで行が `role="button"` + onKeyDown のとき、キーボード操作で
 *   発音ボタンを押しても行の onKeyDown（ダイアログ展開等）が発火しない。
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
      onKeyDown={(e) => e.stopPropagation()}
    >
      <AudioPlayButton src={src} label={label} />
    </span>
  );
}
