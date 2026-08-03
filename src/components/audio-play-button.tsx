"use client";

import { MicIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useTtsFallbackEnabled } from "@/components/tts-fallback-context";
import { Button } from "@/components/ui/button";
import { cancelSpeech, isSpeechSupported, speakEnglish } from "@/lib/speech";

// TTS 対応判定はクライアントでしか確定しない。useSyncExternalStore で SSR は false、
// ハイドレーション後にクライアントの実値へ切り替える（ハイドレーション不整合を避ける）。
const subscribeNoop = () => () => {};
const getSpeechSupported = () => isSpeechSupported();
const getSpeechSupportedServer = () => false;

// 自動音声が端末側で失敗したとき（端末に英語音声が無い等）に、セッション中 1 回だけ案内する。
// API 上は対応（speechSynthesis あり）でも実際の合成に失敗する端末があるため、無反応で
// 壊れて見えるのを防ぐ。
let ttsFailureNotified = false;
function notifyTtsFailure() {
  if (ttsFailureNotified) return;
  ttsFailureNotified = true;
  toast.error(
    "お使いの端末で自動音声を再生できませんでした。端末の音声合成（テキスト読み上げ）の設定をご確認ください。",
    { duration: 6000 },
  );
}

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
 *
 * 音源と自動音声は「信頼できる発音か」が違うため見た目でも区別する（ラベル文字は
 * 変えない ＝ 一覧の列幅がズレないことを優先）。区別は形（アイコン）と濃淡の両方で
 * 付ける（テーマが完全モノクロで色相を使えず、濃淡だけだと弱いため）。
 * - 音源あり: マイクアイコン＋通常コントラストの枠線（＝登録済みの正しい発音）
 * - 自動音声: 再生アイコン＋muted な文字色（＝端末合成の代用）
 * aria-label / title でも同じ区別を伝える（アイコンと濃淡だけに頼らない）。
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
      onError: () => notifyTtsFailure(),
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={toggle}
      aria-label={hasAudio ? `${label}を再生` : `${label}を自動音声で再生`}
      aria-pressed={playing}
      title={
        hasAudio
          ? "登録済みの発音音源を再生します"
          : "発音音源が未登録のため、端末内蔵の自動音声で読み上げます"
      }
      // outline の hover:text-foreground / dark:border-input を上書きするため、
      // 同じ variant の指定を className 側に置いて tailwind-merge に勝たせる。
      className={
        hasAudio
          ? "border-foreground/30 dark:border-foreground/30"
          : "text-muted-foreground hover:text-muted-foreground"
      }
    >
      {playing ? <PauseIcon /> : hasAudio ? <MicIcon /> : <PlayIcon />}
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
