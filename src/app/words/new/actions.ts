"use server";

import { revalidatePath } from "next/cache";

import { wordFormSchema, type WordFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import { createWordForUser } from "@/lib/words-create";
import { mapWordWriteErrorToResult, type WordWriteErrorCode } from "@/lib/words/error-map";

export type CreateWordError = "unauthorized" | "invalid" | WordWriteErrorCode;

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
    // 作成で前後ナビの並びが変わるため、プリフェッチ済みのルーターキャッシュを無効化する。
    revalidatePath(`/words/${word.id}`);
    return { ok: true, wordId: word.id };
  } catch (e) {
    return mapWordWriteErrorToResult(e);
  }
}
