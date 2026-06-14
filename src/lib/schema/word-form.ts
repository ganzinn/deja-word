import { z } from "zod/v3";

import { exampleKinds } from "@/lib/mock/example-kinds";
import { relatedWordKinds } from "@/lib/mock/related-word-kinds";
import type { WordDetail } from "@/lib/words-detail";

const meaningTextSchema = z.object({
  id: z.string().cuid().optional(),
  ownerId: z.string().optional(),
  text: z.string().trim().min(1, "意味を入力してください"),
});

const meaningSchema = z.object({
  id: z.string().cuid().optional(),
  ownerId: z.string().optional(),
  partOfSpeech: z.string().trim().optional().or(z.literal("")),
  pronunciation: z.string().trim().optional().or(z.literal("")),
  texts: z.array(meaningTextSchema).min(1, "意味を 1 件以上入力してください"),
  note: z.string().trim().optional().or(z.literal("")),
  // 発音音源の URL は別 Server Action で管理する読み取り専用フィールド。フォーム送信時は
  // 単語本体の書き込み handler が無視する（編集 UI の表示状態の初期値にのみ使う）。
  pronunciationAudioUrl: z.string().nullable().optional(),
});

const exampleSchema = z.object({
  id: z.string().cuid().optional(),
  ownerId: z.string().optional(),
  kind: z.enum(exampleKinds),
  text: z.string().trim().min(1, "例文を入力してください"),
  meaning: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().optional().or(z.literal("")),
});

const relatedWordSchema = z.object({
  id: z.string().cuid().optional(),
  ownerId: z.string().optional(),
  kind: z.enum(relatedWordKinds).optional(),
  term: z.string().trim().min(1, "関連語を入力してください"),
  partOfSpeech: z.string().trim().optional().or(z.literal("")),
  pronunciation: z.string().trim().optional().or(z.literal("")),
  meaning: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().optional().or(z.literal("")),
  linkedWordId: z.string().cuid().optional(),
});

const memoSchema = z.object({
  id: z.string().cuid().optional(),
  ownerId: z.string().optional(),
  text: z.string().trim().min(1, "メモを入力してください"),
});

const occurrenceDetailSchema = z.object({
  id: z.string().cuid().optional(),
  ownerId: z.string().optional(),
  detail: z.string().trim().optional().or(z.literal("")),
});

const occurrenceSchema = z.object({
  id: z.string().cuid().optional(),
  occurrenceId: z.string().optional(),
  ownerId: z.string(),
  occurrenceOwnerId: z.string().optional(),
  location: z.string().trim().min(1, "掲載箇所名を入力してください"),
  occurrenceNumber: z
    .number()
    .int("整数で入力してください")
    .min(1, "1 以上を入力してください")
    .nullable(),
  details: z.array(occurrenceDetailSchema),
});

export const wordFormSchema = z.object({
  headword: z.string().trim().min(1, "単語を入力してください"),
  meanings: z.array(meaningSchema),
  examples: z.array(exampleSchema),
  relatedWords: z.array(relatedWordSchema),
  memos: z.array(memoSchema),
  occurrences: z.array(occurrenceSchema),
});

export type WordFormValues = z.infer<typeof wordFormSchema>;
export type MeaningValue = z.infer<typeof meaningSchema>;
export type MeaningTextValue = z.infer<typeof meaningTextSchema>;
export type ExampleValue = z.infer<typeof exampleSchema>;
export type RelatedWordValue = z.infer<typeof relatedWordSchema>;
export type MemoValue = z.infer<typeof memoSchema>;
export type OccurrenceValue = z.infer<typeof occurrenceSchema>;
export type OccurrenceDetailValue = z.infer<typeof occurrenceDetailSchema>;

export const emptyMeaning: MeaningValue = {
  partOfSpeech: "",
  pronunciation: "",
  texts: [{ text: "" }],
  note: "",
};

export const emptyExample: ExampleValue = {
  kind: "SENTENCE",
  text: "",
  meaning: "",
  note: "",
};

export const emptyRelatedWord: RelatedWordValue = {
  kind: undefined,
  term: "",
  partOfSpeech: "",
  pronunciation: "",
  meaning: "",
  note: "",
  linkedWordId: undefined,
};

export const emptyMemo: MemoValue = { text: "" };

export const emptyOccurrence: OccurrenceValue = {
  ownerId: "",
  location: "",
  occurrenceNumber: null,
  details: [{ detail: "" }],
};

export function createPresetOccurrence(preset: {
  id: string;
  ownerId: string;
  location: string;
}): OccurrenceValue {
  return {
    occurrenceId: preset.id,
    ownerId: "",
    occurrenceOwnerId: preset.ownerId,
    location: preset.location,
    occurrenceNumber: null,
    details: [{ detail: "" }],
  };
}

export const defaultWordFormValues: WordFormValues = {
  headword: "",
  meanings: [emptyMeaning],
  examples: [],
  relatedWords: [],
  memos: [],
  occurrences: [],
};

export function wordDetailToFormValues(word: WordDetail): WordFormValues {
  return {
    headword: word.headword,
    meanings: word.meanings.map((m) => ({
      id: m.id,
      ownerId: m.ownerId,
      partOfSpeech: m.partOfSpeech ?? "",
      pronunciation: m.pronunciation ?? "",
      texts:
        m.texts.length > 0
          ? m.texts.map((t) => ({ id: t.id, ownerId: t.ownerId, text: t.text }))
          : [{ text: "" }],
      note: m.note ?? "",
      pronunciationAudioUrl: m.pronunciationAudioUrl,
    })),
    examples: word.examples.map((e) => ({
      id: e.id,
      ownerId: e.ownerId,
      kind: e.kind,
      text: e.text,
      meaning: e.meaning ?? "",
      note: e.note ?? "",
    })),
    relatedWords: word.relatedWords.map((r) => ({
      id: r.id,
      ownerId: r.ownerId,
      kind: r.kind ?? undefined,
      term: r.term,
      partOfSpeech: r.partOfSpeech ?? "",
      pronunciation: r.pronunciation ?? "",
      meaning: r.meaning ?? "",
      note: r.note ?? "",
      linkedWordId: r.linkedWordId ?? undefined,
    })),
    memos: word.memos.map((m) => ({ id: m.id, ownerId: m.ownerId, text: m.text })),
    occurrences: word.wordOccurrences.map((wo) => ({
      id: wo.id,
      occurrenceId: wo.occurrence.id,
      ownerId: wo.ownerId,
      occurrenceOwnerId: wo.occurrence.ownerId,
      location: wo.occurrence.location,
      occurrenceNumber: wo.occurrenceNumber ?? null,
      details:
        wo.details.length > 0
          ? wo.details.map((d) => ({ id: d.id, ownerId: d.ownerId, detail: d.detail }))
          : [{ detail: "" }],
    })),
  };
}
