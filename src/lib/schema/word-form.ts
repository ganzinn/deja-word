import { z } from "zod/v3";

import { exampleKinds } from "@/lib/mock/example-kinds";
import { relatedWordKinds } from "@/lib/mock/related-word-kinds";
import { SYSTEM_USER_ID } from "@/lib/system-user";

const meaningSchema = z.object({
  partOfSpeech: z.string().trim().optional().or(z.literal("")),
  pronunciation: z.string().trim().optional().or(z.literal("")),
  text: z.string().trim().min(1, "意味を入力してください"),
  note: z.string().trim().optional().or(z.literal("")),
});

const exampleSchema = z.object({
  kind: z.enum(exampleKinds),
  text: z.string().trim().min(1, "例文を入力してください"),
  meaning: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().optional().or(z.literal("")),
});

const relatedWordSchema = z.object({
  kind: z.enum(relatedWordKinds).optional(),
  term: z.string().trim().min(1, "関連語を入力してください"),
  partOfSpeech: z.string().trim().optional().or(z.literal("")),
  pronunciation: z.string().trim().optional().or(z.literal("")),
  meaning: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().optional().or(z.literal("")),
});

const memoSchema = z.object({
  text: z.string().trim().min(1, "メモを入力してください"),
});

const occurrenceSchema = z.object({
  ownerId: z.string(),
  location: z.string().trim().min(1, "掲載箇所名を入力してください"),
  details: z.array(
    z.object({
      detail: z.string().trim().optional().or(z.literal("")),
    }),
  ),
});

export const wordFormSchema = z.object({
  headword: z.string().trim().min(1, "単語を入力してください"),
  meanings: z.array(meaningSchema).min(1, "意味は 1 つ以上必要です"),
  examples: z.array(exampleSchema),
  relatedWords: z.array(relatedWordSchema),
  memos: z.array(memoSchema),
  occurrences: z.array(occurrenceSchema),
});

export type WordFormValues = z.infer<typeof wordFormSchema>;
export type MeaningValue = z.infer<typeof meaningSchema>;
export type ExampleValue = z.infer<typeof exampleSchema>;
export type RelatedWordValue = z.infer<typeof relatedWordSchema>;
export type MemoValue = z.infer<typeof memoSchema>;
export type OccurrenceValue = z.infer<typeof occurrenceSchema>;

export const emptyMeaning: MeaningValue = {
  partOfSpeech: "",
  pronunciation: "",
  text: "",
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
};

export const emptyMemo: MemoValue = { text: "" };

export const emptyOccurrence: OccurrenceValue = {
  ownerId: "",
  location: "",
  details: [{ detail: "" }],
};

export function createPresetOccurrence(location: string): OccurrenceValue {
  return {
    ownerId: SYSTEM_USER_ID,
    location,
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
