"use server";

import { wordFormSchema, type WordFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import { updateWordForUser } from "@/lib/words-update";
import {
  mapWordWriteErrorToResult,
  type WordWriteErrorCode,
} from "@/lib/words/error-map";

export type UpdateWordError = "unauthorized" | "invalid" | WordWriteErrorCode;

export type UpdateWordResult =
  | { ok: true; wordId: string }
  | { ok: false; error: UpdateWordError; message: string };

export async function updateWord(wordId: string, input: WordFormValues): Promise<UpdateWordResult> {
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
    return mapWordWriteErrorToResult(e);
  }
}
