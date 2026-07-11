import { z } from "zod/v3";

import { SHORT_TEXT_MAX_LENGTH } from "@/lib/schema/content-limits";

export const occurrenceFormSchema = z.object({
  location: z
    .string()
    .trim()
    .min(1, "掲載箇所名を入力してください")
    .max(SHORT_TEXT_MAX_LENGTH, `掲載箇所名は ${SHORT_TEXT_MAX_LENGTH} 文字以内で入力してください`),
  isPreset: z.boolean(),
  autoNumbering: z.boolean(),
});

export type OccurrenceFormValues = z.infer<typeof occurrenceFormSchema>;

export const defaultOccurrenceFormValues: OccurrenceFormValues = {
  location: "",
  isPreset: true,
  autoNumbering: false,
};

export function occurrenceToFormValues(occurrence: {
  location: string;
  isPreset: boolean;
  autoNumbering: boolean;
}): OccurrenceFormValues {
  return {
    location: occurrence.location,
    isPreset: occurrence.isPreset,
    autoNumbering: occurrence.autoNumbering,
  };
}
