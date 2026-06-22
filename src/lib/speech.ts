/**
 * 端末内蔵の音声合成（Web Speech API）で英単語を読み上げる薄いラッパ。
 * 発音音源（mp3）が未登録のときのフォールバック用途。サーバ／API コストは無い。
 * ブラウザ非対応・SSR でも安全に呼べるよう、すべて存在チェックでガードする。
 */

/** speechSynthesis が利用可能か（SSR・非対応ブラウザでは false）。 */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

type SpeakHandlers = {
  onStart?: () => void;
  /** 終了・中断・エラーのいずれでも 1 回呼ばれる（再生中フラグの解除用）。 */
  onEnd?: () => void;
};

/**
 * 英語（en-US）として `text` を読み上げる。実行中の発話は cancel してから話す
 * （複数ボタンが同時に鳴らないようにする）。非対応時は何もせず onEnd を呼ぶ。
 */
export function speakEnglish(text: string, handlers?: SpeakHandlers): void {
  if (!isSpeechSupported()) {
    handlers?.onEnd?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  if (handlers?.onStart) utterance.onstart = handlers.onStart;
  if (handlers?.onEnd) {
    const end = handlers.onEnd;
    utterance.onend = () => end();
    utterance.onerror = () => end();
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/** 実行中・予約済みの発話をすべて止める。 */
export function cancelSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
