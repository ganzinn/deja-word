"use server";

import {
  BookmarkWordNotInScopeError,
  getBookmarkedWordIdsForUser,
  setBookmarkForUser,
} from "@/lib/bookmark-settings";
import { getBookmarkStatesInputSchema } from "@/lib/schema/bookmark";
import { getCurrentSession } from "@/lib/session";

export type ToggleBookmarkError = "unauthorized" | "forbidden" | "unknown";

export type ToggleBookmarkResult =
  | { ok: true }
  | { ok: false; error: ToggleBookmarkError; message: string };

/**
 * 単語ブックマークを目標状態へ冪等に set する（トグルではなく set。連打しても
 * 最後の意図に収束する）。楽観的更新の方針のため `revalidatePath` は呼ばない
 * （一覧・詳細のサーバ供給値は次の遷移・リロードで最新化される）。
 */
export async function toggleBookmark(
  wordId: string,
  bookmarked: boolean,
): Promise<ToggleBookmarkResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  try {
    await setBookmarkForUser(session.user.id, wordId, bookmarked);
    return { ok: true };
  } catch (e) {
    if (e instanceof BookmarkWordNotInScopeError) {
      return {
        ok: false,
        error: "forbidden",
        message: "この単語のブックマークを変更する権限がありません。",
      };
    }
    console.error("[words] toggleBookmark failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "ブックマークの更新に失敗しました。",
    };
  }
}

export type GetBookmarkStatesError = "unauthorized" | "invalid" | "unknown";

export type GetBookmarkStatesResult =
  | { ok: true; bookmarkedWordIds: string[] }
  | { ok: false; error: GetBookmarkStatesError; message: string };

/**
 * 与えた wordIds のうち本人がブックマーク済みの wordId 一覧を返す。
 * 返すのは本人のブックマーク行のみ（`getBookmarkedWordIdsForUser`）で、
 * wordIds の scoped 検証は不要（範囲外・削除済みは非ヒット＝未ブックマーク扱い）。
 */
export async function getBookmarkStates(input: {
  wordIds: string[];
}): Promise<GetBookmarkStatesResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  const parsed = getBookmarkStatesInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      message: "ブックマーク状態の取得リクエストが不正です。",
    };
  }

  try {
    const bookmarkedWordIds = await getBookmarkedWordIdsForUser(
      session.user.id,
      parsed.data.wordIds,
    );
    return { ok: true, bookmarkedWordIds };
  } catch (e) {
    console.error("[words] getBookmarkStates failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "ブックマーク状態の取得に失敗しました。",
    };
  }
}
