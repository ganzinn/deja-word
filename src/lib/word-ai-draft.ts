import "server-only";

import { generateText, Output } from "ai";
import type { z } from "zod/v3";

import { commonPartsOfSpeech } from "@/lib/mock/parts-of-speech";
import {
  normalizeWordAiDraft,
  WORD_AI_LIMITS,
  wordAiDraftSchemaFor,
  type WordAiDraft,
  type WordAiSections,
} from "@/lib/schema/word-ai-draft";

export const DEFAULT_WORD_AI_MODEL = "anthropic/claude-sonnet-5";

const GENERATE_TIMEOUT_MS = 30_000;

// AI Gateway の認証手段があるかどうか。Vercel 上（VERCEL / OIDC）はキー不要で動作する。
// false のときは AI入力ボタン自体を描画しない（Server Component から props で下ろす）。
export function isWordAiEnabled(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL,
  );
}

export class WordAiInvalidResponseError extends Error {
  constructor() {
    super("AI response did not match wordAiDraftSchema");
    this.name = "WordAiInvalidResponseError";
  }
}

// 要求されたセクションの要件だけをプロンプトに載せる（非要求分の生成トークンを使わせない）。
export function buildWordAiPrompt(headword: string, sections: WordAiSections): string {
  const requirements: string[] = [];
  if (sections.meanings) {
    const partOfSpeechKeys = commonPartsOfSpeech
      .map((p) => `${p.value} (${p.fullLabel})`)
      .join(", ");
    requirements.push(
      `- meanings: もっともよく使われる意味を頻出順に最大 ${WORD_AI_LIMITS.meanings} 件。
  - partOfSpeech: 次のキーのいずれか 1 つ（該当がなければ空文字 ""）: ${partOfSpeechKeys}
  - pronunciation: アメリカ英語の IPA 発音記号。スラッシュや括弧は付けない（例: ɪˈfemərəl）。
  - texts: その意味の日本語の訳語を 1〜${WORD_AI_LIMITS.textsPerMeaning} 件。`,
    );
  }
  if (sections.phrases) {
    requirements.push(
      `- phrases: "${headword}" を含む頻出の成句・熟語を最大 ${WORD_AI_LIMITS.phrases} 件。text は英語、meaning はその日本語訳。`,
    );
  }
  if (sections.sentences) {
    requirements.push(
      `- sentences: もっとも頻出の意味を使った自然な英語の例文を最大 ${WORD_AI_LIMITS.sentences} 件。CEFR B1 程度の平易な語彙を使い、text は英語、meaning はその日本語訳。`,
    );
  }
  return `あなたは日本の英語学習者向け辞書の編集者です。英単語 "${headword}" の学習用下書きデータを生成してください。

要件:
${requirements.join("\n")}
- "${headword}" が英単語として認識できない場合も、もっとも近い解釈で生成する。`;
}

// テストから AI SDK を切り離すための注入ポイント。既定実装は AI Gateway 経由の generateText。
export type GenerateDraftFn = (args: {
  model: string;
  prompt: string;
  schema: z.ZodTypeAny;
}) => Promise<unknown>;

const defaultGenerate: GenerateDraftFn = async ({ model, prompt, schema }) => {
  const result = await generateText({
    model,
    output: Output.object({ schema }),
    prompt,
    abortSignal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
  });
  return result.output;
};

export async function generateWordAiDraft(
  headword: string,
  sections: WordAiSections,
  generate: GenerateDraftFn = defaultGenerate,
): Promise<WordAiDraft> {
  const model = process.env.WORD_AI_MODEL || DEFAULT_WORD_AI_MODEL;
  const schema = wordAiDraftSchemaFor(sections);
  const raw = await generate({ model, prompt: buildWordAiPrompt(headword, sections), schema });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new WordAiInvalidResponseError();
  return normalizeWordAiDraft(parsed.data);
}
