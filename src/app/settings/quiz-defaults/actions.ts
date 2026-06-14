"use server";

import { revalidatePath } from "next/cache";

import {
  DefaultOccurrenceNotInScopeError,
  saveQuizDefaultsForUser,
} from "@/lib/quiz-default-settings";
import { saveQuizDefaultsInputSchema, type SaveQuizDefaultsInput } from "@/lib/schema/quiz";
import { getCurrentSession } from "@/lib/session";

export type QuizDefaultsActionError = "unauthorized" | "invalid" | "forbidden" | "unknown";

export type QuizDefaultsActionResult =
  | { ok: true }
  | { ok: false; error: QuizDefaultsActionError; message: string };

const UNAUTHORIZED: QuizDefaultsActionResult = {
  ok: false,
  error: "unauthorized",
  message: "ログインが必要です。再度ログインしてください。",
};

export async function saveQuizDefaults(
  input: SaveQuizDefaultsInput,
): Promise<QuizDefaultsActionResult> {
  const session = await getCurrentSession();
  if (!session) return UNAUTHORIZED;

  const parsed = saveQuizDefaultsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: "入力内容を確認してください。" };
  }

  try {
    await saveQuizDefaultsForUser(session.user.id, parsed.data);
    revalidatePath("/settings/quiz-defaults");
    return { ok: true };
  } catch (e) {
    if (e instanceof DefaultOccurrenceNotInScopeError) {
      return {
        ok: false,
        error: "forbidden",
        message: "この掲載箇所をデフォルトに設定する権限がありません。",
      };
    }
    console.error("[settings/quiz-defaults] saveQuizDefaults failed", e);
    return { ok: false, error: "unknown", message: "デフォルト設定の保存に失敗しました。" };
  }
}
