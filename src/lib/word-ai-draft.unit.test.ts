import { afterEach, describe, expect, test, vi } from "vitest";

import { commonPartOfSpeechValues } from "@/lib/mock/parts-of-speech";
import type { WordAiDraft, WordAiSections } from "@/lib/schema/word-ai-draft";

import {
  buildWordAiPrompt,
  DEFAULT_WORD_AI_MODEL,
  generateWordAiDraft,
  isWordAiEnabled,
  WordAiInvalidResponseError,
} from "./word-ai-draft";

const ALL_SECTIONS: WordAiSections = { meanings: true, phrases: true, sentences: true };

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
  test("全セクション要求時は見出し語と全品詞キーを含む", () => {
    const prompt = buildWordAiPrompt("ephemeral", ALL_SECTIONS);
    expect(prompt).toContain('"ephemeral"');
    expect(prompt).toContain("meanings:");
    expect(prompt).toContain("phrases:");
    expect(prompt).toContain("sentences:");
    for (const key of commonPartOfSpeechValues) {
      expect(prompt).toContain(key);
    }
  });

  test("意味は品詞・発音の組み合わせ単位で集約する指示を含む", () => {
    const prompt = buildWordAiPrompt("keen", ALL_SECTIONS);
    expect(prompt).toContain("品詞と発音記号の組み合わせごとに 1 件");
  });

  test("非要求セクションの要件（品詞キー含む）はプロンプトに載らない", () => {
    const prompt = buildWordAiPrompt("ephemeral", {
      meanings: false,
      phrases: false,
      sentences: true,
    });
    expect(prompt).not.toContain("meanings:");
    expect(prompt).not.toContain("phrases:");
    expect(prompt).toContain("sentences:");
    expect(prompt).not.toContain("noun");
  });
});

describe("generateWordAiDraft", () => {
  test("正常系: 既定モデル・プロンプト・動的スキーマで generate を呼び、normalize 済みを返す", async () => {
    vi.stubEnv("WORD_AI_MODEL", "");
    const generate = vi.fn().mockResolvedValue(validRaw());
    const draft = await generateWordAiDraft("ephemeral", ALL_SECTIONS, generate);
    expect(generate).toHaveBeenCalledWith({
      model: DEFAULT_WORD_AI_MODEL,
      prompt: buildWordAiPrompt("ephemeral", ALL_SECTIONS),
      schema: expect.anything(),
    });
    // normalize の証拠として trim 済みであること
    expect(draft.meanings[0].texts).toEqual(["儚い"]);
  });

  test("部分生成: 欠けたセクションは [] で補完した完全な WordAiDraft を返す", async () => {
    const sections: WordAiSections = { meanings: false, phrases: false, sentences: true };
    const generate = vi.fn().mockResolvedValue({
      sentences: [{ text: "Fame is ephemeral.", meaning: "名声は儚い。" }],
    });
    const draft = await generateWordAiDraft("ephemeral", sections, generate);
    expect(draft).toEqual({
      meanings: [],
      phrases: [],
      sentences: [{ text: "Fame is ephemeral.", meaning: "名声は儚い。" }],
    });
  });

  test("部分生成: 応答に非要求セクションが混ざっても strip される", async () => {
    const sections: WordAiSections = { meanings: false, phrases: false, sentences: true };
    const generate = vi.fn().mockResolvedValue(validRaw());
    const draft = await generateWordAiDraft("ephemeral", sections, generate);
    expect(draft.meanings).toEqual([]);
    expect(draft.phrases).toEqual([]);
    expect(draft.sentences).toHaveLength(1);
  });

  test("WORD_AI_MODEL 環境変数でモデルを上書きできる", async () => {
    vi.stubEnv("WORD_AI_MODEL", "anthropic/claude-haiku-4.5");
    const generate = vi.fn().mockResolvedValue(validRaw());
    await generateWordAiDraft("ephemeral", ALL_SECTIONS, generate);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "anthropic/claude-haiku-4.5" }),
    );
  });

  test("schema 違反の応答は WordAiInvalidResponseError", async () => {
    const generate = vi.fn().mockResolvedValue({ meanings: "not-an-array" });
    await expect(generateWordAiDraft("ephemeral", ALL_SECTIONS, generate)).rejects.toBeInstanceOf(
      WordAiInvalidResponseError,
    );
  });

  test("generate の例外はそのまま伝播する", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(generateWordAiDraft("ephemeral", ALL_SECTIONS, generate)).rejects.toThrow(
      "timeout",
    );
  });
});
