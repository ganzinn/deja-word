import { z } from "zod/v3";

export const occurrenceFormSchema = z.object({
  location: z.string().trim().min(1, "掲載箇所名を入力してください"),
  isPreset: z.boolean(),
});

export type OccurrenceFormValues = z.infer<typeof occurrenceFormSchema>;

export const defaultOccurrenceFormValues: OccurrenceFormValues = {
  location: "",
  isPreset: true,
};

export function occurrenceToFormValues(occurrence: {
  location: string;
  isPreset: boolean;
}): OccurrenceFormValues {
  return { location: occurrence.location, isPreset: occurrence.isPreset };
}
