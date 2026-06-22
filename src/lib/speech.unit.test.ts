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

function installSpeechMock({ speaking = false, pending = false } = {}) {
  const speak = vi.fn();
  const cancel = vi.fn();
  const addEventListener = vi.fn();
  // lang / voice を保持する最小の Utterance スタブ
  class UtteranceStub {
    lang = "";
    voice: unknown = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event?: unknown) => void) | null = null;
    constructor(public text: string) {}
  }
  const g = globalThis as SpeechGlobals;
  g.window = {
    speechSynthesis: { speak, cancel, addEventListener, getVoices: () => [], speaking, pending },
  };
  g.SpeechSynthesisUtterance = UtteranceStub;
  return { speak, cancel };
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

  it("speaks an en-US utterance with the given text", () => {
    const { speak } = installSpeechMock();
    speakEnglish("hello");
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as { text: string; lang: string };
    expect(utterance.text).toBe("hello");
    expect(utterance.lang).toBe("en-US");
  });

  it("does not cancel when nothing is speaking (avoids the cancel→speak race)", () => {
    const { speak, cancel } = installSpeechMock({ speaking: false, pending: false });
    speakEnglish("hello");
    expect(cancel).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it("cancels first when speech is in flight", () => {
    const { cancel } = installSpeechMock({ speaking: true });
    speakEnglish("hello");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("wires onEnd to both onend and onerror of the utterance", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { speak } = installSpeechMock();
    const onEnd = vi.fn();
    speakEnglish("hi", { onEnd });
    const utterance = speak.mock.calls[0][0] as {
      onend: () => void;
      onerror: (event?: unknown) => void;
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
