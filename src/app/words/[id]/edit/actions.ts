"use server";

import { wordFormSchema, type WordFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import { DuplicateHeadwordError, DuplicateOccurrenceNumberError } from "@/lib/words-create";
import {
  WordNotFoundError,
  updateWordForUser,
  type UpdateWordError,
} from "@/lib/words-update";

export type UpdateWordResult =
  | { ok: true; wordId: string }
  | { ok: false; error: UpdateWordError; message: string };

export async function updateWord(
  wordId: string,
  input: WordFormValues,
): Promise<UpdateWordResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  const parsed = wordFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: "入力内容を確認してください。" };
  }

  try {
    const word = await updateWordForUser(session.user.id, wordId, parsed.data);
    return { ok: true, wordId: word.id };
  } catch (e) {
    if (e instanceof WordNotFoundError) {
      return {
        ok: false,
        error: "not_found",
        message: "対象の単語が見つかりません。",
      };
    }
    if (e instanceof DuplicateHeadwordError) {
      return {
        ok: false,
        error: "duplicate",
        message: "この単語はすでに登録されています。",
      };
    }
    if (e instanceof DuplicateOccurrenceNumberError) {
      return {
        ok: false,
        error: "duplicate_occurrence_number",
        message: "同じ出典内で重複する掲載番号が指定されています。",
      };
    }
    console.error("[words/edit] updateWord failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "更新に失敗しました。しばらくしてから再度お試しください。",
    };
  }
}
