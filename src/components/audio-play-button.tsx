"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useTtsFallbackEnabled } from "@/components/tts-fallback-context";
import { Button } from "@/components/ui/button";
import { cancelSpeech, isSpeechSupported, speakEnglish } from "@/lib/speech";

// TTS 対応判定はクライアントでしか確定しない。useSyncExternalStore で SSR は false、
// ハイドレーション後にクライアントの実値へ切り替える（ハイドレーション不整合を避ける）。
const subscribeNoop = () => () => {};
const getSpeechSupported = () => isSpeechSupported();
const getSpeechSupportedServer = () => false;

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
 * 発音記号の隣に並べる小さな再生ボタン。
 * - 発音音源（`src`）があれば内部の <audio> を再生する（音源を常に優先）。
 * - 音源が無く、自動音声フォールバック設定が ON で `ttsText` があり、ブラウザが
 *   音声合成に対応していれば、端末内蔵 TTS（Web Speech API）で読み上げる。
 * - どちらも無ければ何も描画しない（`reserveSpaceWhenEmpty` 指定時は同寸の不可視
 *   プレースホルダでスロットを確保する）。
 * click で play / 再 click で停止。`playing` 表示は音源・自動音声で共用する。
 */
export function AudioPlayButton({
  src,
  label,
  ttsText,
  reserveSpaceWhenEmpty,
}: AudioPlayButtonProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const ttsFallbackEnabled = useTtsFallbackEnabled();
  const speechSupported = useSyncExternalStore(
    subscribeNoop,
    getSpeechSupported,
    getSpeechSupportedServer,
  );

  // 再生中にアンマウントされたら発話を止める（音源は <audio> 破棄で自然停止）。
  useEffect(() => {
    return () => {
      if (playing) cancelSpeech();
    };
  }, [playing]);

  const hasAudio = Boolean(src);
  const ttsText_ = ttsText?.trim() ?? "";
  // 自動音声は「音源なし・設定 ON・読み上げ語あり・ブラウザ対応」のときだけ提供する。
  const showTts = !hasAudio && ttsFallbackEnabled && ttsText_.length > 0 && speechSupported;

  if (!hasAudio && !showTts) {
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
    if (hasAudio) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        void audio.play();
      } else {
        audio.pause();
      }
      return;
    }
    // 自動音声: 再生中なら停止、そうでなければ読み上げ開始
    if (playing) {
      cancelSpeech();
      setPlaying(false);
      return;
    }
    speakEnglish(ttsText_, {
      onStart: () => setPlaying(true),
      onEnd: () => setPlaying(false),
    });
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
      {hasAudio ? (
        <audio
          ref={audioRef}
          src={src ?? undefined}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setPlaying(false)}
        />
      ) : null}
    </Button>
  );
}
