import { z } from "zod/v3";

export const accountProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "名前を入力してください")
    .max(50, "名前は 50 文字以内で入力してください"),
});

export type AccountProfileValues = z.infer<typeof accountProfileSchema>;
