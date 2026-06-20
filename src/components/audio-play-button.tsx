"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type AudioPlayButtonProps = {
  src: string | null | undefined;
  label: string;
  /**
   * `src` が無いとき、`null` を返す代わりに同じ寸法の不可視プレースホルダを描画する。
   * 一覧で発音ボタンの有無により隣のバッジ位置がズレるのを防ぐ用途（既定 false）。
   */
  reserveSpaceWhenEmpty?: boolean;
};

/**
 * 発音記号の隣に並べる小さな再生ボタン。`src` が無ければ何も描画しない
 * （`reserveSpaceWhenEmpty` 指定時は同寸の不可視プレースホルダでスロットを確保する）。
 * 内部に 1 つの <audio> を持ち、click で play / 再 click で pause。
 */
export function AudioPlayButton({ src, label, reserveSpaceWhenEmpty }: AudioPlayButtonProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  if (!src) {
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

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={toggle}
      aria-label={`${label}を再生`}
      aria-pressed={playing}
    >
      {playing ? <PauseIcon /> : <PlayIcon />}
      <span>{label}</span>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setPlaying(false)}
      />
    </Button>
  );
}
