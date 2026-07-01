import { z } from "zod/v3";

import { isCommonPartOfSpeech } from "@/lib/mock/parts-of-speech";

export const WORD_AI_LIMITS = {
  meanings: 3,
  textsPerMeaning: 3,
  phrases: 3,
  sentences: 2,
} as const;

// AI に返させる下書きの契約。フォームスキーマ（word-form.ts）とは変更理由が異なるため
// 別定義とし、id / ownerId / notes などフォーム都合のフィールドは持たせない。
// 品詞は z.enum にせず normalize で検証する（AI が想定外の値を返しても全体を失敗させず、
// その品詞だけ未選択 "" に落とす）。
export const wordAiDraftSchema = z.object({
  meanings: z.array(
    z.object({
      partOfSpeech: z.string(),
      pronunciation: z.string(),
      texts: z.array(z.string()),
    }),
  ),
  phrases: z.array(z.object({ text: z.string(), meaning: z.string() })),
  sentences: z.array(z.object({ text: z.string(), meaning: z.string() })),
});

export type WordAiDraft = z.infer<typeof wordAiDraftSchema>;

export function normalizeWordAiDraft(raw: WordAiDraft): WordAiDraft {
  const meanings = raw.meanings
    .map((m) => ({
      partOfSpeech: isCommonPartOfSpeech(m.partOfSpeech.trim()) ? m.partOfSpeech.trim() : "",
      pronunciation: m.pronunciation.trim(),
      texts: m.texts
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .slice(0, WORD_AI_LIMITS.textsPerMeaning),
    }))
    .filter((m) => m.texts.length > 0)
    .slice(0, WORD_AI_LIMITS.meanings);

  return {
    meanings,
    phrases: normalizeExamples(raw.phrases, WORD_AI_LIMITS.phrases),
    sentences: normalizeExamples(raw.sentences, WORD_AI_LIMITS.sentences),
  };
}

function normalizeExamples(
  items: { text: string; meaning: string }[],
  limit: number,
): { text: string; meaning: string }[] {
  return items
    .map((e) => ({ text: e.text.trim(), meaning: e.meaning.trim() }))
    .filter((e) => e.text.length > 0)
    .slice(0, limit);
}
