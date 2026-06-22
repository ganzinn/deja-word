import { z } from "zod/v3";

// Better Auth の既定パスワード長（min 8 / max 128）に合わせる。
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const setPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `パスワードは ${MIN_PASSWORD_LENGTH} 文字以上で入力してください`)
      .max(MAX_PASSWORD_LENGTH, `パスワードは ${MAX_PASSWORD_LENGTH} 文字以内で入力してください`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

export type SetPasswordValues = z.infer<typeof setPasswordSchema>;
