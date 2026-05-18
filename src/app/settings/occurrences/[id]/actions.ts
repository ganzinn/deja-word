"use server";

import { deleteOccurrenceForUser } from "@/lib/occurrences-delete";
import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { getCurrentSession } from "@/lib/session";

export type DeleteOccurrenceError = "unauthorized" | "not_found" | "unknown";

export type DeleteOccurrenceResult =
  | { ok: true }
  | { ok: false; error: DeleteOccurrenceError; message: string };

export async function deleteOccurrence(
  occurrenceId: string,
): Promise<DeleteOccurrenceResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  try {
    await deleteOccurrenceForUser(session.user.id, occurrenceId);
    return { ok: true };
  } catch (e) {
    if (e instanceof OccurrenceNotFoundError) {
      return {
        ok: false,
        error: "not_found",
        message: "対象の掲載箇所が見つかりません。",
      };
    }
    console.error("[settings/occurrences/[id]] deleteOccurrence failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "削除に失敗しました。しばらくしてから再度お試しください。",
    };
  }
}
