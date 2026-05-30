"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type AudioPlayButtonProps = {
  src: string | null | undefined;
  label: string;
};

/**
 * 発音記号の隣に並べる小さな再生ボタン。`src` が無ければ何も描画しない。
 * 内部に 1 つの <audio> を持ち、click で play / 再 click で pause。
 */
export function AudioPlayButton({ src, label }: AudioPlayButtonProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  if (!src) return null;

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
