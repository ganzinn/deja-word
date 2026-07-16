import { z } from "zod/v3";

/**
 * 一括取得 action（06 `getBookmarkStates`）で受け取る wordIds の上限。
 * 「結果一覧の単語数 = 1 回の quiz の出題数」の上限で、現実の最大（≒ 1900 語）に
 * 余裕を持たせた値。巨大配列による IN 句の資源枯渇を防ぐガードレール。
 */
export const BOOKMARK_WORD_IDS_MAX_COUNT = 3000;

/** server-action 専用入力のためエラーメッセージは付けない（action 層が汎用メッセージに畳む）。 */
export const getBookmarkStatesInputSchema = z.object({
  wordIds: z.array(z.string()).max(BOOKMARK_WORD_IDS_MAX_COUNT),
});

export type GetBookmarkStatesInput = z.infer<typeof getBookmarkStatesInputSchema>;
