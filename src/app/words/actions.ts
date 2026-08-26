"use server";

import {
  addBookmarksForUser,
  BookmarkWordNotInScopeError,
  getBookmarkedWordIdsForUser,
  removeBookmarksForUser,
  setBookmarkForUser,
} from "@/lib/bookmark-settings";
import {
  addBookmarksInputSchema,
  getBookmarkStatesInputSchema,
  removeBookmarksByFilterInputSchema,
  type AddBookmarksInput,
  type RemoveBookmarksByFilterInput,
} from "@/lib/schema/bookmark";
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

export type AddBookmarksError = "unauthorized" | "invalid" | "unknown";

export type AddBookmarksResult =
  | { ok: true; bookmarkedWordIds: string[]; skippedWordIds: string[] }
  | { ok: false; error: AddBookmarksError; message: string };

/**
 * 与えた wordIds を本人のブックマークへ一括登録する。検証で弾かれた wordId
 * （削除済み・scoped 範囲外）は `skippedWordIds` に入るだけで、全件が弾かれても
 * エラーにしない（`forbidden` 変種を持たない理由:
 * docs/adr/0094-bulk-bookmark-skip-and-colocation.md）。楽観的更新の方針のため
 * `revalidatePath` は呼ばない。
 */
export async function addBookmarks(input: AddBookmarksInput): Promise<AddBookmarksResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  const parsed = addBookmarksInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      message: "ブックマークの一括登録リクエストが不正です。",
    };
  }

  try {
    const { bookmarkedWordIds, skippedWordIds } = await addBookmarksForUser(
      session.user.id,
      parsed.data.wordIds,
    );
    return { ok: true, bookmarkedWordIds, skippedWordIds };
  } catch (e) {
    console.error("[words] addBookmarks failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "ブックマークの一括登録に失敗しました。",
    };
  }
}

export type RemoveBookmarksByFilterError = "unauthorized" | "invalid" | "unknown";

export type RemoveBookmarksByFilterResult =
  | { ok: true; removedCount: number }
  | { ok: false; error: RemoveBookmarksByFilterError; message: string };

/**
 * 単語一覧の「ブックマークのみ」絞り込みに一致するブックマークをまとめて解除する。
 * 入力は表示中の wordIds ではなく絞り込み条件で、サーバが一覧と同じ where を再評価する
 * （ページを跨ぐ全件が対象のため。設計: docs/adr/0104-bulk-unbookmark-by-filter.md）。
 * 解除は本人のブックマーク行のみで 0 件解除も正常系のため `forbidden` 変種を持たない。
 * 確認ダイアログを挟む全件操作のため楽観的更新はせず、呼び出し側が成功後に
 * `router.refresh()` で一覧を再取得する（`revalidatePath` は呼ばない）。
 */
export async function removeBookmarksByFilter(
  input: RemoveBookmarksByFilterInput,
): Promise<RemoveBookmarksByFilterResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  const parsed = removeBookmarksByFilterInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid",
      message: "ブックマークの一括解除リクエストが不正です。",
    };
  }

  try {
    const { removedCount } = await removeBookmarksForUser(session.user.id, parsed.data);
    return { ok: true, removedCount };
  } catch (e) {
    console.error("[words] removeBookmarksByFilter failed", e);
    return {
      ok: false,
      error: "unknown",
      message: "ブックマークの一括解除に失敗しました。",
    };
  }
}
