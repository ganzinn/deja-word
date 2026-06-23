"use server";

import { revalidatePath } from "next/cache";

import {
  saveUserPreferencesInputSchema,
  type SaveUserPreferencesInput,
} from "@/lib/schema/user-preferences";
import { getCurrentSession } from "@/lib/session";
import { saveUserPreferences } from "@/lib/user-preferences";

export type GeneralSettingsActionResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "invalid" | "unknown"; message: string };

const UNAUTHORIZED: GeneralSettingsActionResult = {
  ok: false,
  error: "unauthorized",
  message: "ログインが必要です。再度ログインしてください。",
};

export async function saveGeneralSettings(
  input: SaveUserPreferencesInput,
): Promise<GeneralSettingsActionResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = saveUserPreferencesInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: "入力内容を確認してください。" };
  }

  try {
    await saveUserPreferences(session.user.id, parsed.data);
    revalidatePath("/settings/general");
    return { ok: true };
  } catch (e) {
    console.error("[settings/general] saveGeneralSettings failed", e);
    return { ok: false, error: "unknown", message: "設定の保存に失敗しました。" };
  }
}
