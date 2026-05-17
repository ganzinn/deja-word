"use server";

import { wordFormSchema, type WordFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import {
  DuplicateHeadwordError,
  DuplicateOccurrenceNumberError,
  createWordForUser,
  type CreateWordError,
} from "@/lib/words-create";

export type CreateWordResult =
  | { ok: true; wordId: string }
  | { ok: false; error: CreateWordError; message: string };

export async function createWord(input: WordFormValues): Promise<CreateWordResult> {
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
    const word = await createWordForUser(session.user.id, parsed.data);
    return { ok: true, wordId: word.id };
  } catch (e) {
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
    console.error("[words/new] createWord failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "登録に失敗しました。しばらくしてから再度お試しください。",
    };
  }
}
