import { afterEach, describe, expect, it, vi } from "vitest";

import { cancelSpeech, isSpeechSupported, speakEnglish } from "./speech";

/**
 * speech.ts は Web Speech API（ブラウザ専用）の薄いラッパ。unit 環境は node のため
 * `window` は未定義。SSR/非対応のガードと、グローバルを差し込んだ対応時の挙動を検証する。
 */

type SpeechGlobals = {
  window?: unknown;
  SpeechSynthesisUtterance?: unknown;
};

type TtsDispatch = (id: string, event: "start" | "end" | "error", detail: string) => void;

/**
 * Android WebView シェルが注入するネイティブ TTS ブリッジ（window.DejaWordTts）のスタブを
 * 差し込む。既に window がある場合（speechSynthesis モックとの併用）はそこへ追加する。
 */
function installBridgeMock({ available = true } = {}) {
  const speak = vi.fn();
  const cancel = vi.fn();
  const bridge = { speak, cancel, isAvailable: () => available };
  const g = globalThis as SpeechGlobals;
  const w = (g.window ?? {}) as Record<string, unknown>;
  w.DejaWordTts = bridge;
  g.window = w;
  return {
    speak,
    cancel,
    dispatch: (...args: Parameters<TtsDispatch>) => {
      const fn = w.__dejaWordTtsDispatch as TtsDispatch | undefined;
      fn?.(...args);
    },
    lastUtteranceId: () => speak.mock.calls.at(-1)?.[1] as string,
  };
}

function installSpeechMock() {
  const speak = vi.fn();
  const cancel = vi.fn();
  // lang を保持する最小の Utterance スタブ
  class UtteranceStub {
    lang = "";
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }
  const g = globalThis as SpeechGlobals;
  g.window = { speechSynthesis: { speak, cancel } };
  g.SpeechSynthesisUtterance = UtteranceStub;
  return { speak, cancel, UtteranceStub };
}

afterEach(() => {
  const g = globalThis as SpeechGlobals;
  delete g.window;
  delete g.SpeechSynthesisUtterance;
  vi.restoreAllMocks();
});

describe("isSpeechSupported", () => {
  it("returns false when window is undefined (SSR/node)", () => {
    expect(isSpeechSupported()).toBe(false);
  });

  it("returns true when speechSynthesis is present", () => {
    installSpeechMock();
    expect(isSpeechSupported()).toBe(true);
  });
});

describe("speakEnglish", () => {
  it("no-ops and calls onEnd when unsupported", () => {
    const onEnd = vi.fn();
    const onStart = vi.fn();
    speakEnglish("hello", { onStart, onEnd });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("cancels any in-flight speech, then speaks an en-US utterance", () => {
    const { speak, cancel } = installSpeechMock();
    speakEnglish("hello");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as { text: string; lang: string };
    expect(utterance.text).toBe("hello");
    expect(utterance.lang).toBe("en-US");
  });

  it("strips rich text markup before speaking", () => {
    const { speak } = installSpeechMock();
    speakEnglish("He is **bound** to *do* it.");
    const utterance = speak.mock.calls[0][0] as { text: string };
    expect(utterance.text).toBe("He is bound to do it.");
  });

  it("drops placeholders (tilde / ellipsis) and annotation brackets", () => {
    const { speak } = installSpeechMock();
    speakEnglish("so that ~");
    speakEnglish("【米】check");
    speakEnglish("be certain that ...");
    speakEnglish("suggest (to 〜) that …");
    const texts = speak.mock.calls.map((c) => (c[0] as { text: string }).text);
    expect(texts).toEqual(["so that", "check", "be certain that", "suggest to that"]);
  });

  // 括弧は意味で出し分ける: (…) は中身が読める語なので記号だけ落とし、
  // [...] は言い換え候補なので中身ごと落とす。
  it("keeps the contents of round brackets, dropping only the symbols", () => {
    const { speak } = installSpeechMock();
    speakEnglish("(be) similar to 〜");
    speakEnglish("consider A (to be) B");
    speakEnglish("demand that A (should) do");
    const texts = speak.mock.calls.map((c) => (c[0] as { text: string }).text);
    expect(texts).toEqual(["be similar to", "consider A to be B", "demand that A should do"]);
  });

  it("drops square brackets along with their contents", () => {
    const { speak } = installSpeechMock();
    speakEnglish("compare A with [to] B");
    const utterance = speak.mock.calls[0][0] as { text: string };
    expect(utterance.text).toBe("compare A with B");
  });

  it("drops only the symbol when a square bracket has no pair", () => {
    const { speak } = installSpeechMock();
    speakEnglish("compare A with [to B");
    speakEnglish("consider A (to be B");
    const texts = speak.mock.calls.map((c) => (c[0] as { text: string }).text);
    expect(texts).toEqual(["compare A with to B", "consider A to be B"]);
  });

  it("treats full-width brackets the same as half-width", () => {
    const { speak } = installSpeechMock();
    speakEnglish("（be） similar to 〜");
    speakEnglish("compare A with ［to］ B");
    // 開き・閉じの字形が混在しても角括弧のペアとして扱う
    speakEnglish("compare A with [to］ B");
    const texts = speak.mock.calls.map((c) => (c[0] as { text: string }).text);
    expect(texts).toEqual(["be similar to", "compare A with B", "compare A with B"]);
  });

  it("drops a square bracket pair nested in round brackets", () => {
    const { speak } = installSpeechMock();
    speakEnglish("compare A with (to [or] from) B");
    // 丸括弧は入れ子でも記号が全部落ちる
    speakEnglish("(a (b) c)");
    const texts = speak.mock.calls.map((c) => (c[0] as { text: string }).text);
    expect(texts).toEqual(["compare A with to from B", "a b c"]);
  });

  it("keeps the placeholder words A/B/do/doing", () => {
    const { speak } = installSpeechMock();
    speakEnglish("(be) worth doing");
    speakEnglish("A is to B what C is to D");
    const texts = speak.mock.calls.map((c) => (c[0] as { text: string }).text);
    expect(texts).toEqual(["be worth doing", "A is to B what C is to D"]);
  });

  it("does not glue words together when a bracket sits between them", () => {
    const { speak } = installSpeechMock();
    speakEnglish("A(B)C");
    const utterance = speak.mock.calls[0][0] as { text: string };
    expect(utterance.text).toBe("A B C");
  });

  it("keeps sentence-ending periods（省略記号だけを落とす）", () => {
    const { speak } = installSpeechMock();
    speakEnglish("He is bound to do it.");
    const utterance = speak.mock.calls[0][0] as { text: string };
    expect(utterance.text).toBe("He is bound to do it.");
  });

  it("no-ops with onEnd when nothing is left to speak", () => {
    const { speak } = installSpeechMock();
    const onEnd = vi.fn();
    speakEnglish("〜", { onEnd });
    expect(speak).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("calls onEnd on normal end", () => {
    const { speak } = installSpeechMock();
    const onEnd = vi.fn();
    speakEnglish("hi", { onEnd });
    const utterance = speak.mock.calls[0][0] as { onend: () => void };
    utterance.onend();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("calls onError (with the code) and onEnd on a synthesis failure", () => {
    const { speak } = installSpeechMock();
    const onEnd = vi.fn();
    const onError = vi.fn();
    speakEnglish("hi", { onEnd, onError });
    const utterance = speak.mock.calls[0][0] as {
      onerror: (event: { error: string }) => void;
    };
    utterance.onerror({ error: "synthesis-failed" });
    expect(onError).toHaveBeenCalledWith("synthesis-failed");
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("does not call onError for intentional cancel/interrupt, but still calls onEnd", () => {
    const { speak } = installSpeechMock();
    const onEnd = vi.fn();
    const onError = vi.fn();
    speakEnglish("hi", { onEnd, onError });
    const utterance = speak.mock.calls[0][0] as {
      onerror: (event: { error: string }) => void;
    };
    utterance.onerror({ error: "canceled" });
    utterance.onerror({ error: "interrupted" });
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(2);
  });
});

describe("cancelSpeech", () => {
  it("does nothing when unsupported", () => {
    expect(() => cancelSpeech()).not.toThrow();
  });

  it("calls speechSynthesis.cancel when supported", () => {
    const { cancel } = installSpeechMock();
    cancelSpeech();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("native bridge (Android WebView)", () => {
  it("isSpeechSupported returns true with bridge only (no speechSynthesis)", () => {
    installBridgeMock();
    expect(isSpeechSupported()).toBe(true);
  });

  it("ignores an unavailable bridge: unsupported, speakEnglish no-ops with onEnd", () => {
    installBridgeMock({ available: false });
    expect(isSpeechSupported()).toBe(false);
    const onEnd = vi.fn();
    speakEnglish("hello", { onEnd });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("speaks via the bridge and installs the dispatch receiver", () => {
    const { speak, lastUtteranceId } = installBridgeMock();
    speakEnglish("hello");
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toBe("hello");
    expect(lastUtteranceId()).toMatch(/^tts-\d+$/);
    const w = (globalThis as SpeechGlobals).window as Record<string, unknown>;
    expect(typeof w.__dejaWordTtsDispatch).toBe("function");
  });

  it("strips rich text markup before handing text to the bridge", () => {
    const { speak } = installBridgeMock();
    speakEnglish("He is **bound** to *do* it.");
    expect(speak.mock.calls[0][0]).toBe("He is bound to do it.");
  });

  it("routes start/end events to onStart/onEnd", () => {
    const bridge = installBridgeMock();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    speakEnglish("hello", { onStart, onEnd });
    const id = bridge.lastUtteranceId();
    bridge.dispatch(id, "start", "");
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    bridge.dispatch(id, "end", "");
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("routes error events to onError (with detail) and onEnd", () => {
    const bridge = installBridgeMock();
    const onEnd = vi.fn();
    const onError = vi.fn();
    speakEnglish("hello", { onEnd, onError });
    bridge.dispatch(bridge.lastUtteranceId(), "error", "tts-unavailable");
    expect(onError).toHaveBeenCalledWith("tts-unavailable");
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("guarantees onEnd fires once even if the same id is dispatched twice", () => {
    const bridge = installBridgeMock();
    const onEnd = vi.fn();
    speakEnglish("hello", { onEnd });
    const id = bridge.lastUtteranceId();
    bridge.dispatch(id, "end", "");
    bridge.dispatch(id, "end", "");
    bridge.dispatch(id, "error", "late");
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("ignores dispatches for unknown utterance ids", () => {
    const bridge = installBridgeMock();
    speakEnglish("hello");
    expect(() => bridge.dispatch("tts-unknown", "end", "")).not.toThrow();
  });

  it("issues distinct utterance ids per speak", () => {
    const bridge = installBridgeMock();
    speakEnglish("one");
    const first = bridge.lastUtteranceId();
    speakEnglish("two");
    expect(bridge.lastUtteranceId()).not.toBe(first);
  });

  it("prefers the bridge over speechSynthesis for speak and cancel", () => {
    const speech = installSpeechMock();
    const bridge = installBridgeMock();
    speakEnglish("hello");
    expect(bridge.speak).toHaveBeenCalledTimes(1);
    expect(speech.speak).not.toHaveBeenCalled();
    cancelSpeech();
    expect(bridge.cancel).toHaveBeenCalledTimes(1);
    expect(speech.cancel).not.toHaveBeenCalled();
  });
});
