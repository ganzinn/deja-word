/**
 * 端末内蔵の音声合成で英単語を読み上げる薄いラッパ。
 * 発音音源（mp3）が未登録のときのフォールバック用途。サーバ／API コストは無い。
 * ブラウザ非対応・SSR でも安全に呼べるよう、すべて存在チェックでガードする。
 *
 * 経路は 2 つあり、ネイティブブリッジを優先する:
 * 1. Android アプリ（WebView シェル）が addJavascriptInterface で注入する
 *    `window.DejaWordTts`。Android WebView は speechSynthesis 非対応（crbug 40468168）
 *    のため、ネイティブ TextToSpeech へ橋渡しする（docs/adr/0073-webview-android-app.md）。
 * 2. ブラウザの Web Speech API（speechSynthesis）。
 */

import { stripRichTextMarkup } from "@/lib/rich-text";

/**
 * Android アプリ側（TtsBridge.kt）が注入するブリッジ。契約を変える場合は
 * アプリの再ビルド・再配布が必要（docs/ops/android-webview.md）。
 */
type NativeTtsBridge = {
  /** 発話を開始する。実行中の発話はネイティブ側が止めてから話す（QUEUE_FLUSH）。 */
  speak(text: string, utteranceId: string): void;
  /** 実行中・保留中の発話を止める。対応する dispatch は "end" で届く。 */
  cancel(): void;
  /** 端末 TTS が利用可能か（エンジン初期化失敗・en-US 音声なしで false）。 */
  isAvailable(): boolean;
};

type NativeTtsEvent = "start" | "end" | "error";

declare global {
  interface Window {
    DejaWordTts?: NativeTtsBridge;
    /** ネイティブ側が evaluateJavascript で呼ぶイベント受け口（本モジュールが設置）。 */
    __dejaWordTtsDispatch?: (utteranceId: string, event: NativeTtsEvent, detail: string) => void;
  }
}

function nativeBridge(): NativeTtsBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const bridge = window.DejaWordTts;
  if (!bridge) return undefined;
  return bridge.isAvailable() ? bridge : undefined;
}

/** speechSynthesis が利用可能か（SSR・非対応ブラウザでは false）。 */
export function isSpeechSupported(): boolean {
  if (nativeBridge()) return true;
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

type SpeakHandlers = {
  onStart?: () => void;
  /** 終了・中断・エラーのいずれでも 1 回呼ばれる（再生中フラグの解除用）。 */
  onEnd?: () => void;
  /**
   * 合成失敗時に呼ばれる（端末に音声データが無い等。引数は SpeechSynthesisErrorEvent.error
   * 相当のコード文字列）。意図的な中断（cancel 由来）では呼ばない。
   */
  onError?: (error: string) => void;
};

// ブリッジ経路の実行中発話。end / error で delete することで onEnd の 1 回保証を担保する
// （ネイティブから同一 id へ二重に届いても 2 回目は無視される）。
let utteranceSeq = 0;
const inflight = new Map<string, SpeakHandlers>();

function installNativeDispatcher(): void {
  if (window.__dejaWordTtsDispatch) return;
  window.__dejaWordTtsDispatch = (utteranceId, event, detail) => {
    const handlers = inflight.get(utteranceId);
    if (!handlers) return;
    if (event === "start") {
      handlers.onStart?.();
      return;
    }
    inflight.delete(utteranceId);
    // 意図的な中断はネイティブ側（onStop）が "end" に正規化済みなので、
    // "error" はここでは常に合成失敗として扱ってよい。
    if (event === "error") handlers.onError?.(detail);
    handlers.onEnd?.();
  };
}

/** 地域ラベル等の注記（`【米】check`）。英語として読ませたい語ではないので中身ごと落とす。 */
const ANNOTATION_PATTERN = /【[^】]*】/g;

/** 「ここに語が入る」プレースホルダのチルダ（`so that ~`）。3 つの字形すべてを対象にする。 */
const PLACEHOLDER_PATTERN = /[~〜～]/g;

/**
 * 読み上げ用テキストへ正規化する（docs/adr/0078-speech-text-normalization.md）。
 * 表示のための記号を落とし、語だけを残す。
 */
export function toSpokenText(raw: string): string {
  return stripRichTextMarkup(raw)
    .replace(ANNOTATION_PATTERN, " ")
    .replace(PLACEHOLDER_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 英語（en-US）として `text` を読み上げる。実行中の発話は cancel してから話す
 * （複数ボタンが同時に鳴らないようにする）。非対応時は何もせず onEnd を呼ぶ。
 *
 * 表示用の記号（装飾記法・プレースホルダ・注記）は `toSpokenText` でここで落とす。
 * 記号の扱いは合成エンジン任せ（読み上げる／区切りになる）でネイティブとブラウザで揃わないため、
 * 読み上げの一本道であるこの関数で正規化し、呼び出し側が気をつけなくて済むようにする。
 */
export function speakEnglish(rawText: string, handlers?: SpeakHandlers): void {
  const text = toSpokenText(rawText);
  // 記号だけの文字列は読む語が残らない。無音の発話を投げず、完了として扱う。
  if (text.length === 0) {
    handlers?.onEnd?.();
    return;
  }
  const bridge = nativeBridge();
  if (bridge) {
    installNativeDispatcher();
    const utteranceId = `tts-${++utteranceSeq}`;
    inflight.set(utteranceId, handlers ?? {});
    bridge.speak(text, utteranceId);
    return;
  }
  if (!isSpeechSupported()) {
    handlers?.onEnd?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  if (handlers?.onStart) utterance.onstart = handlers.onStart;
  utterance.onend = () => handlers?.onEnd?.();
  utterance.onerror = (event) => {
    // cancel() による中断（"canceled" / "interrupted"）は失敗扱いしない
    if (event.error !== "canceled" && event.error !== "interrupted") {
      handlers?.onError?.(event.error);
    }
    handlers?.onEnd?.();
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** 実行中・予約済みの発話をすべて止める。 */
export function cancelSpeech(): void {
  const bridge = nativeBridge();
  if (bridge) {
    // 実行中エントリはネイティブの onStop → "end" dispatch 経由で閉じる
    bridge.cancel();
    return;
  }
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
