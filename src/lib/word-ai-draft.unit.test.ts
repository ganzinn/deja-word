import { afterEach, describe, expect, test, vi } from "vitest";

import { commonPartOfSpeechValues } from "@/lib/mock/parts-of-speech";
import type { WordAiDraft } from "@/lib/schema/word-ai-draft";

import {
  buildWordAiPrompt,
  DEFAULT_WORD_AI_MODEL,
  generateWordAiDraft,
  isWordAiEnabled,
  WordAiInvalidResponseError,
} from "./word-ai-draft";

function validRaw(): WordAiDraft {
  return {
    meanings: [{ partOfSpeech: "adjective", pronunciation: "ɪˈfemərəl", texts: [" 儚い "] }],
    phrases: [{ text: "ephemeral beauty", meaning: "儚い美しさ" }],
    sentences: [{ text: "Fame is ephemeral.", meaning: "名声は儚い。" }],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isWordAiEnabled", () => {
  test("認証手段がなければ false", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    expect(isWordAiEnabled()).toBe(false);
  });

  test("AI_GATEWAY_API_KEY があれば true", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL", "");
    expect(isWordAiEnabled()).toBe(true);
  });

  test("Vercel 上（OIDC）はキーなしでも true", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    expect(isWordAiEnabled()).toBe(true);
  });
});

describe("buildWordAiPrompt", () => {
  test("見出し語と全品詞キーを含む", () => {
    const prompt = buildWordAiPrompt("ephemeral");
    expect(prompt).toContain('"ephemeral"');
    for (const key of commonPartOfSpeechValues) {
      expect(prompt).toContain(key);
    }
  });
});

describe("generateWordAiDraft", () => {
  test("正常系: 既定モデルとプロンプトで generate を呼び、normalize 済みを返す", async () => {
    vi.stubEnv("WORD_AI_MODEL", "");
    const generate = vi.fn().mockResolvedValue(validRaw());
    const draft = await generateWordAiDraft("ephemeral", generate);
    expect(generate).toHaveBeenCalledWith({
      model: DEFAULT_WORD_AI_MODEL,
      prompt: buildWordAiPrompt("ephemeral"),
    });
    // normalize の証拠として trim 済みであること
    expect(draft.meanings[0].texts).toEqual(["儚い"]);
  });

  test("WORD_AI_MODEL 環境変数でモデルを上書きできる", async () => {
    vi.stubEnv("WORD_AI_MODEL", "anthropic/claude-haiku-4.5");
    const generate = vi.fn().mockResolvedValue(validRaw());
    await generateWordAiDraft("ephemeral", generate);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "anthropic/claude-haiku-4.5" }),
    );
  });

  test("schema 違反の応答は WordAiInvalidResponseError", async () => {
    const generate = vi.fn().mockResolvedValue({ meanings: "not-an-array" });
    await expect(generateWordAiDraft("ephemeral", generate)).rejects.toBeInstanceOf(
      WordAiInvalidResponseError,
    );
  });

  test("generate の例外はそのまま伝播する", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(generateWordAiDraft("ephemeral", generate)).rejects.toThrow("timeout");
  });
});
