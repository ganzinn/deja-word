"use server";

import { occurrenceFormSchema, type OccurrenceFormValues } from "@/lib/schema/occurrence-form";
import { getCurrentSession } from "@/lib/session";
import {
  DuplicateOccurrenceLocationError,
  createOccurrenceForUser,
} from "@/lib/occurrences-create";

export type CreateOccurrenceError = "unauthorized" | "invalid" | "duplicate" | "unknown";

export type CreateOccurrenceResult =
  | { ok: true; occurrenceId: string }
  | { ok: false; error: CreateOccurrenceError; message: string };

export async function createOccurrence(
  input: OccurrenceFormValues,
): Promise<CreateOccurrenceResult> {
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
    const { id } = await createOccurrenceForUser(session.user.id, parsed.data);
    return { ok: true, occurrenceId: id };
  } catch (e) {
    if (e instanceof DuplicateOccurrenceLocationError) {
      return {
        ok: false,
        error: "duplicate",
        message: "同じ名前の掲載箇所がすでに登録されています。",
      };
    }
    console.error("[settings/occurrences/new] createOccurrence failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "登録に失敗しました。しばらくしてから再度お試しください。",
    };
  }
}
