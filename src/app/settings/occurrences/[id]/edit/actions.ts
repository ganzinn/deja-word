"use server";

import {
  occurrenceFormSchema,
  type OccurrenceFormValues,
} from "@/lib/schema/occurrence-form";
import { getCurrentSession } from "@/lib/session";
import { DuplicateOccurrenceLocationError } from "@/lib/occurrences-create";
import {
  OccurrenceNotFoundError,
  updateOccurrenceForUser,
} from "@/lib/occurrences-update";

export type UpdateOccurrenceError =
  | "unauthorized"
  | "invalid"
  | "not_found"
  | "duplicate"
  | "unknown";

export type UpdateOccurrenceResult =
  | { ok: true }
  | { ok: false; error: UpdateOccurrenceError; message: string };

export async function updateOccurrence(
  occurrenceId: string,
  input: OccurrenceFormValues,
): Promise<UpdateOccurrenceResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  const parsed = occurrenceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: "入力内容を確認してください。" };
  }

  try {
    await updateOccurrenceForUser(session.user.id, occurrenceId, parsed.data);
    return { ok: true };
  } catch (e) {
    if (e instanceof OccurrenceNotFoundError) {
      return {
        ok: false,
        error: "not_found",
        message: "対象の掲載箇所が見つかりません。",
      };
    }
    if (e instanceof DuplicateOccurrenceLocationError) {
      return {
        ok: false,
        error: "duplicate",
        message: "同じ名前の掲載箇所がすでに登録されています。",
      };
    }
    console.error("[settings/occurrences/edit] updateOccurrence failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "更新に失敗しました。しばらくしてから再度お試しください。",
    };
  }
}
