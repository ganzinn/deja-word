"use server";

import { revalidatePath } from "next/cache";

import {
  AutoNumberOccurrenceNotOwnedError,
  AutoNumberRequiresPresetError,
  disableAutoNumberingForUser,
  setAutoNumberingForUser,
} from "@/lib/occurrence-auto-number-settings";
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
    // 自動採番はプリセット ON が前提。プリセットを外したら自動採番も連動で OFF にする。
    if (!isPreset) {
      await disableAutoNumberingForUser(session.user.id, occurrenceId);
    }
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

export type ToggleAutoNumberingError = "unauthorized" | "forbidden" | "unknown";

export type ToggleAutoNumberingResult =
  | { ok: true }
  | { ok: false; error: ToggleAutoNumberingError; message: string };

export async function toggleAutoNumbering(
  occurrenceId: string,
  autoNumbering: boolean,
): Promise<ToggleAutoNumberingResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  try {
    await setAutoNumberingForUser(session.user.id, occurrenceId, autoNumbering);
    revalidatePath("/settings/occurrences");
    return { ok: true };
  } catch (e) {
    if (e instanceof AutoNumberOccurrenceNotOwnedError) {
      return {
        ok: false,
        error: "forbidden",
        message: "この掲載箇所の自動採番設定を変更する権限がありません。",
      };
    }
    if (e instanceof AutoNumberRequiresPresetError) {
      return {
        ok: false,
        error: "forbidden",
        message: "自動採番はプリセット ON の掲載箇所のみ設定できます。",
      };
    }
    console.error("[settings/occurrences] toggleAutoNumbering failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "自動採番設定の更新に失敗しました。",
    };
  }
}
