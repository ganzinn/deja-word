"use server";

import { revalidatePath } from "next/cache";

import { getCurrentSession } from "@/lib/session";
import {
  ForbiddenDeleteError,
  WordNotFoundError,
  deleteWordForUser,
  type DeleteWordError,
} from "@/lib/words-delete";

export type DeleteWordResult =
  | { ok: true }
  | { ok: false; error: DeleteWordError; message: string };

export async function deleteWord(wordId: string): Promise<DeleteWordResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  try {
    await deleteWordForUser(session.user.id, wordId);
    // 削除を実行した同一タブ（同一ルーターインスタンス）で、back/forward 履歴復元により
    // 削除前の内容が出るのを防ぐ。
    revalidatePath(`/words/${wordId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof WordNotFoundError) {
      return {
        ok: false,
        error: "not_found",
        message: "対象の単語が見つかりません。",
      };
    }
    if (e instanceof ForbiddenDeleteError) {
      return {
        ok: false,
        error: "forbidden",
        message: "他のユーザーが追記した項目があるため、この単語は削除できません。",
      };
    }
    console.error("[words/[id]] deleteWord failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "削除に失敗しました。しばらくしてから再度お試しください。",
    };
  }
}
