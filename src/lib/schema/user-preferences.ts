import { z } from "zod/v3";

/**
 * `saveUserPreferences` の入力（ユーザー全般設定）。
 * 各項目 nullable: null = 未設定（アプリ既定値に従う）を表す。
 */
export const saveUserPreferencesInputSchema = z.object({
  // 発音音源が未登録のとき自動音声で代用する。null = 未設定（既定で有効）
  ttsFallback: z.boolean().nullable(),
});

export type SaveUserPreferencesInput = z.infer<typeof saveUserPreferencesInputSchema>;
