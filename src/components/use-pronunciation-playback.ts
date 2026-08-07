"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useTtsFallbackEnabled } from "@/components/tts-fallback-context";
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

/** 再生手段が無いとき（音源なし・自動音声も使えない）の戻り値。 */
type UnavailablePlayback = {
  available: false;
  hasAudio: false;
  playing: false;
  toggle: () => void;
  audioProps: null;
};

/** 再生手段があるときの戻り値。`hasAudio` が false なら自動音声で鳴らす。 */
type AvailablePlayback = {
  available: true;
  hasAudio: boolean;
  playing: boolean;
  toggle: () => void;
  /** 音源ありのときだけ非 null。呼び出し側が `<audio {...audioProps} />` として描画する。 */
  audioProps: {
    ref: React.RefObject<HTMLAudioElement | null>;
    src: string;
    preload: "none";
    onPlay: () => void;
    onPause: () => void;
    onEnded: () => void;
    onError: () => void;
  } | null;
};

export type PronunciationPlayback = UnavailablePlayback | AvailablePlayback;

/**
 * 発音の再生制御（音源優先・自動音声フォールバック）。押下のたびに play / 停止をトグルする。
 *
 * 見た目を持たないのは、同じ再生制御を 2 つの提示で使うため（`AudioPlayButton` の行内ボタンと、
 * `PronunciationCard` のカード全体タップ）。どちらの提示でも「音源を常に優先し、無いときだけ
 * 設定 ON・読み上げ語あり・ブラウザ対応の条件を満たせば自動音声」という判定は同一である。
 *
 * - `src`: 登録済みの発音音源 URL。あれば常にこちらを優先する。
 * - `ttsText`: 音源が無いときに端末内蔵 TTS で読み上げる語（英単語・英文）。
 *
 * `available` が false のときは再生手段がまったく無い。呼び出し側はボタン／タップ領域ごと
 * 出さない（`toggle` は何もしない no-op）。
 */
export function usePronunciationPlayback({
  src,
  ttsText,
}: {
  src: string | null | undefined;
  ttsText?: string | null;
}): PronunciationPlayback {
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

  if (!hasAudio && !showTts) {
    return { available: false, hasAudio: false, playing: false, toggle: noop, audioProps: null };
  }

  return {
    available: true,
    hasAudio,
    playing,
    toggle,
    audioProps: hasAudio
      ? {
          ref: audioRef,
          src: src as string,
          preload: "none",
          onPlay: () => setPlaying(true),
          onPause: () => setPlaying(false),
          onEnded: () => setPlaying(false),
          onError: () => setPlaying(false),
        }
      : null,
  };
}

function noop() {}
