"use server";

import { revalidatePath } from "next/cache";

import {
  PresetOccurrenceNotInScopeError,
  setPresetForUser,
} from "@/lib/occurrence-preset-settings";
import { getCurrentSession } from "@/lib/session";

export type TogglePresetSettingError = "unauthorized" | "forbidden" | "unknown";

export type TogglePresetSettingResult =
  | { ok: true }
  | { ok: false; error: TogglePresetSettingError; message: string };

export async function togglePresetSetting(
  occurrenceId: string,
  isPreset: boolean,
): Promise<TogglePresetSettingResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  try {
    await setPresetForUser(session.user.id, occurrenceId, isPreset);
    revalidatePath("/settings/occurrences");
    return { ok: true };
  } catch (e) {
    if (e instanceof PresetOccurrenceNotInScopeError) {
      return {
        ok: false,
        error: "forbidden",
        message: "この掲載箇所のプリセット設定を変更する権限がありません。",
      };
    }
    console.error("[settings/occurrences] togglePresetSetting failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "プリセット設定の更新に失敗しました。",
    };
  }
}
