/**
 * 端末内蔵の音声合成（Web Speech API）で英単語を読み上げる薄いラッパ。
 * 発音音源（mp3）が未登録のときのフォールバック用途。サーバ／API コストは無い。
 * ブラウザ非対応・SSR でも安全に呼べるよう、すべて存在チェックでガードする。
 *
 * Android Chrome 対策:
 * - `getVoices()` は初回 空で、`voiceschanged` 後に揃う。空のまま `lang` だけ指定して
 *   `speak()` すると端末既定ボイスに当たらず無音になる個体があるため、モジュール読込時に
 *   ボイス一覧を温めて cache し、発話時に英語ボイスを明示指定する。
 * - `cancel()` 直後の `speak()` は発話が落ちることがあるため、実際に発話中のときだけ cancel する。
 */

/** speechSynthesis が利用可能か（SSR・非対応ブラウザでは false）。 */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// 取得済みボイス一覧の cache（Android Chrome は初回 getVoices() が空のため温めておく）。
let cachedVoices: SpeechSynthesisVoice[] = [];

function refreshVoices(): void {
  if (!isSpeechSupported()) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) cachedVoices = voices;
}

// 読込時にボイス一覧を温める（クライアントのみ。遅れて揃う端末にも voiceschanged で追従）。
if (isSpeechSupported()) {
  refreshVoices();
  window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
}

/** 英語（できれば en-US）のボイスを選ぶ。Android は lang を "_" 区切りで返すため正規化する。 */
function pickEnglishVoice(): SpeechSynthesisVoice | undefined {
  const norm = (lang: string) => lang.replace("_", "-").toLowerCase();
  return (
    cachedVoices.find((v) => norm(v.lang) === "en-us") ??
    cachedVoices.find((v) => norm(v.lang).startsWith("en"))
  );
}

type SpeakHandlers = {
  onStart?: () => void;
  /** 終了・中断・エラーのいずれでも 1 回呼ばれる（再生中フラグの解除用）。 */
  onEnd?: () => void;
};

/**
 * 英語として `text` を読み上げる。実行中の発話があるときだけ止めてから話す。
 * 非対応時は何もせず onEnd を呼ぶ。読み上げに失敗した場合は console に手掛かりを残す。
 */
export function speakEnglish(text: string, handlers?: SpeakHandlers): void {
  if (!isSpeechSupported()) {
    handlers?.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  // cancel→speak の競合（Android で発話が落ちる）を避け、実際に発話中のときだけ止める。
  if (synth.speaking || synth.pending) synth.cancel();

  refreshVoices();
  const voice = pickEnglishVoice();
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  if (handlers?.onStart) utterance.onstart = handlers.onStart;
  const end = handlers?.onEnd;
  utterance.onend = () => end?.();
  utterance.onerror = (event) => {
    // 端末に英語ボイスが無い等で失敗したときの手掛かりを残す（無音の切り分け用）。
    console.warn("[speech] speech synthesis error", event);
    end?.();
  };
  synth.speak(utterance);
}

/** 実行中・予約済みの発話をすべて止める。 */
export function cancelSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
