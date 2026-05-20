import "server-only";

import { upsertExamples } from "./example-handler";
import { upsertMeanings } from "./meaning-handler";
import { upsertMemos } from "./memo-handler";
import { upsertRelatedWords } from "./related-word-handler";
import { upsertWordOccurrences } from "./word-occurrence-handler";

import type { ChildAllowedIds } from "./allowed-ids";
import type { EditorContext, Tx } from "./shared";
import type { WordFormValues } from "@/lib/schema/word-form";

export { resolveChildAllowedIds, type ChildAllowedIds } from "./allowed-ids";
export { editorContextFor, type EditorContext } from "./shared";

/**
 * 単語の子エンティティ（意味 / 例文 / 関連語 / メモ / 出典）を 5 つの handler に
 * 委譲して書き込む薄いオーケストレータ。トランザクションは呼び出し側（UseCase）が
 * 張り、ここでは受け取った tx を各 handler に渡すだけ。順序は旧 createWordChildren
 * と同一に保つ。
 */
export async function writeWordChildren(
  tx: Tx,
  ctx: EditorContext,
  wordId: string,
  values: WordFormValues,
  allowed: ChildAllowedIds,
): Promise<void> {
  await upsertMeanings(tx, ctx, values.meanings, { wordId });
  await upsertExamples(tx, ctx, values.examples, { wordId });
  await upsertRelatedWords(tx, ctx, values.relatedWords, {
    wordId,
    allowedLinkedIds: allowed.linkedWordIds,
  });
  await upsertMemos(tx, ctx, values.memos, { wordId });
  await upsertWordOccurrences(tx, ctx, values.occurrences, {
    wordId,
    allowedPresetIds: allowed.presetOccurrenceIds,
  });
}
