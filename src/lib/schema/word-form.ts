import { z } from "zod/v3";

import { relatedWordKinds } from "@/lib/mock/related-word-kinds";

const meaningSchema = z.object({
  text: z.string().trim().min(1, "意味を入力してください"),
  partOfSpeech: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().optional().or(z.literal("")),
});

const relatedWordSchema = z.object({
  kind: z.enum(relatedWordKinds),
  text: z.string().trim().min(1, "関連語を入力してください"),
  meaning: z.string().trim().optional().or(z.literal("")),
  partOfSpeech: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().optional().or(z.literal("")),
  pronunciation: z.string().trim().optional().or(z.literal("")),
  isMP: z.boolean(),
  isBM: z.boolean(),
});

const memoSchema = z.object({
  text: z.string().trim().min(1, "メモを入力してください"),
});

const wordTagSchema = z.object({
  tagId: z.string().min(1),
  pageNumber: z
    .number({ invalid_type_error: "数字で入力してください" })
    .int("整数で入力してください")
    .positive("1 以上で入力してください")
    .optional(),
});

export const wordFormSchema = z.object({
  word: z.string().trim().min(1, "単語を入力してください"),
  pronunciation: z.string().trim().optional().or(z.literal("")),
  meanings: z.array(meaningSchema).min(1, "意味は 1 つ以上必要です"),
  relatedWords: z.array(relatedWordSchema),
  memos: z.array(memoSchema),
  tags: z.array(wordTagSchema),
});

export type WordFormValues = z.infer<typeof wordFormSchema>;
export type MeaningValue = z.infer<typeof meaningSchema>;
export type RelatedWordValue = z.infer<typeof relatedWordSchema>;
export type MemoValue = z.infer<typeof memoSchema>;
export type WordTagValue = z.infer<typeof wordTagSchema>;

export const emptyMeaning: MeaningValue = {
  text: "",
  partOfSpeech: "",
  note: "",
};

export const emptyRelatedWord: RelatedWordValue = {
  kind: "example",
  text: "",
  meaning: "",
  partOfSpeech: "",
  note: "",
  pronunciation: "",
  isMP: false,
  isBM: false,
};

export const emptyMemo: MemoValue = { text: "" };

export const defaultWordFormValues: WordFormValues = {
  word: "",
  pronunciation: "",
  meanings: [emptyMeaning],
  relatedWords: [emptyRelatedWord],
  memos: [emptyMemo],
  tags: [],
};
