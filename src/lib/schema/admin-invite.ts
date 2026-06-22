import { z } from "zod/v3";

export const adminInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "メールアドレスを入力してください")
    .email("メールアドレスの形式が正しくありません")
    .transform((v) => v.toLowerCase()),
});

export type AdminInviteValues = z.infer<typeof adminInviteSchema>;
