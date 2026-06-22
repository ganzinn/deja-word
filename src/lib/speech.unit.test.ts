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

  it("wires onEnd to both onend and onerror of the utterance", () => {
    const { speak } = installSpeechMock();
    const onEnd = vi.fn();
    speakEnglish("hi", { onEnd });
    const utterance = speak.mock.calls[0][0] as {
      onend: () => void;
      onerror: () => void;
    };
    utterance.onend();
    utterance.onerror();
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
