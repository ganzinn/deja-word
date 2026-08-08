import { z } from "zod/v3";

/**
 * ブックマーク系一括 action（一括取得・一括登録）で受け取る wordIds の上限。
 * 「結果一覧の単語数 = 1 回の quiz の出題数」の上限で、現実の最大に
 * 余裕を持たせた値。巨大配列による IN 句の資源枯渇を防ぐガードレール。
 */
export const BOOKMARK_WORD_IDS_MAX_COUNT = 3000;

/** server-action 専用入力のためエラーメッセージは付けない（action 層が汎用メッセージに畳む）。 */
export const getBookmarkStatesInputSchema = z.object({
  wordIds: z.array(z.string()).max(BOOKMARK_WORD_IDS_MAX_COUNT),
});

export type GetBookmarkStatesInput = z.infer<typeof getBookmarkStatesInputSchema>;

/**
 * 一括登録 action（`addBookmarks`）の入力。
 * 0 件は呼び出し側のバグなので `min(1)` で弾く（0 件取得が無害な正常系である
 * `getBookmarkStatesInputSchema` が `min` を持たないのとの非対称は意図的）。
 */
export const addBookmarksInputSchema = z.object({
  wordIds: z.array(z.string()).min(1).max(BOOKMARK_WORD_IDS_MAX_COUNT),
});

export type AddBookmarksInput = z.infer<typeof addBookmarksInputSchema>;
