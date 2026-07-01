import { z } from "zod/v3";

import { isCommonPartOfSpeech } from "@/lib/mock/parts-of-speech";

export const WORD_AI_LIMITS = {
  meanings: 3,
  textsPerMeaning: 3,
  phrases: 3,
  sentences: 2,
} as const;

// 生成対象セクションの指定。クライアントがフォームの入力状況から算出し、
// Server Action の入力検証にも使う。
export const wordAiSectionsSchema = z.object({
  meanings: z.boolean(),
  phrases: z.boolean(),
  sentences: z.boolean(),
});

export type WordAiSections = z.infer<typeof wordAiSectionsSchema>;

// AI に返させる下書きの契約。フォームスキーマ（word-form.ts）とは変更理由が異なるため
// 別定義とし、id / ownerId / notes などフォーム都合のフィールドは持たせない。
// 品詞は z.enum にせず normalize で検証する（AI が想定外の値を返しても全体を失敗させず、
// その品詞だけ未選択 "" に落とす）。
const meaningDraftSchema = z.object({
  partOfSpeech: z.string(),
  pronunciation: z.string(),
  texts: z.array(z.string()),
});

const exampleDraftSchema = z.object({ text: z.string(), meaning: z.string() });

export const wordAiDraftSchema = z.object({
  meanings: z.array(meaningDraftSchema),
  phrases: z.array(exampleDraftSchema),
  sentences: z.array(exampleDraftSchema),
});

export type WordAiDraft = z.infer<typeof wordAiDraftSchema>;

// 要求セクションのキーだけを持つスキーマ。生成側の Output スキーマに使うことで、
// AI が非要求セクションを生成できなくなる（プロンプト指示のみより確実にトークン節約）。
// 条件付き spread の shape は TS が unknown に落とすため、出力型を明示する
// （どの組み合わせでも出力は Partial<WordAiDraft> の部分集合）。
export function wordAiDraftSchemaFor(sections: WordAiSections): z.ZodType<Partial<WordAiDraft>> {
  return z.object({
    ...(sections.meanings ? { meanings: z.array(meaningDraftSchema) } : {}),
    ...(sections.phrases ? { phrases: z.array(exampleDraftSchema) } : {}),
    ...(sections.sentences ? { sentences: z.array(exampleDraftSchema) } : {}),
  }) as unknown as z.ZodType<Partial<WordAiDraft>>;
}

// 部分生成の応答（欠けたセクション）は [] で補完して完全な WordAiDraft に揃える。
export function normalizeWordAiDraft(raw: Partial<WordAiDraft>): WordAiDraft {
  const meanings = (raw.meanings ?? [])
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
    phrases: normalizeExamples(raw.phrases ?? [], WORD_AI_LIMITS.phrases),
    sentences: normalizeExamples(raw.sentences ?? [], WORD_AI_LIMITS.sentences),
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
