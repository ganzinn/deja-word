import "server-only";

import type { Tx } from "./shared";
import type { EntityKey } from "@/lib/words/policy/row-policy";

/**
 * 編集者所有・かつフォームに残っていない子エンティティを削除する。フォームに id が
 * 1 件もない場合は editor 所有の当該エンティティを全削除する（旧 `words-update.ts`
 * から移設。トランザクションは呼び出し側 UseCase が張る）。
 */
export async function deleteOrphanedEditorOwned(
  tx: Tx,
  entity: EntityKey,
  wordId: string,
  userId: string,
  idsInForm: Set<string>,
): Promise<void> {
  const ids = Array.from(idsInForm);
  const where = {
    wordId,
    ownerId: userId,
    ...(ids.length > 0 ? { id: { notIn: ids } } : {}),
  };
  switch (entity) {
    case "meaning":
      await tx.meaning.deleteMany({ where });
      return;
    case "example":
      await tx.example.deleteMany({ where });
      return;
    case "relatedWord":
      await tx.relatedWord.deleteMany({ where });
      return;
    case "memo":
      await tx.memo.deleteMany({ where });
      return;
    case "wordOccurrence":
      await tx.wordOccurrence.deleteMany({ where });
      return;
  }
}
