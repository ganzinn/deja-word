import { z } from "zod/v3";

// admin-invite と同じ email ルール（trim / 必須 / 形式 / 小文字化）を踏襲する。
const emailField = z
  .string()
  .trim()
  .min(1, "メールアドレスを入力してください")
  .email("メールアドレスの形式が正しくありません")
  .transform((v) => v.toLowerCase());

export const changeUserEmailSchema = z.object({
  userId: z.string().trim().min(1, "ユーザーが指定されていません"),
  newEmail: emailField,
});

export type ChangeUserEmailValues = z.infer<typeof changeUserEmailSchema>;
