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

/** 単語一覧のキーワード一致方法（words-list.ts の WordMatchMode と同値。client 共用のため zod で再定義）。 */
const wordMatchModeSchema = z.enum(["prefix", "contains", "suffix"]);

/**
 * 一括解除 action（`removeBookmarksByFilter`）の入力。一括登録と違い wordIds を列挙せず、
 * 単語一覧の「ブックマークのみ」絞り込みと同じ条件をサーバで再評価する
 * （ページを跨ぐ全件が対象のため。設計: docs/adr/0104-bulk-unbookmark-by-filter.md）。
 * kind は一覧のビュー（単語単位 / 掲載箇所単位）に対応する。q は未指定・空文字とも
 * 「キーワードなし」扱いで、正規化はサーバ側 builder の責務。
 */
export const removeBookmarksByFilterInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("word"),
    q: z.string().optional(),
    match: wordMatchModeSchema,
  }),
  z.object({
    kind: z.literal("occurrence"),
    occurrenceId: z.string().min(1),
    q: z.string().optional(),
    match: wordMatchModeSchema,
    from: z.number().int().min(1).optional(),
    to: z.number().int().min(1).optional(),
  }),
]);

export type RemoveBookmarksByFilterInput = z.infer<typeof removeBookmarksByFilterInputSchema>;
