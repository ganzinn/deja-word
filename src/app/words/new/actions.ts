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
    // 作成を実行した同一タブ（同一ルーターインスタンス）で、back/forward 履歴復元により
    // 変更前の内容が出るのを防ぐ。渡すのは作成直後の新規 ID の詳細パスのため、この効果は
    // 現行の全パージ挙動（暫定）に依存する（指定パスのみに狭められた時点で効果が残らない）。
    revalidatePath(`/words/${word.id}`);
    return { ok: true, wordId: word.id };
  } catch (e) {
    return mapWordWriteErrorToResult(e);
  }
}
