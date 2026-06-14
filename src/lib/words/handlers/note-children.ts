import "server-only";

import { isSystemOwned } from "@/lib/words/policy/row-policy";

import type { EditorContext } from "./shared";
import type { NoteValue } from "@/lib/schema/word-form";

/**
 * 補足説明(notes)子配列の書き込み規約。意味テキスト(MeaningText)と同一:
 * - pass-through（共通=system 所有の親）では、system note は並び順だけ更新し、
 *   編集者の note は追記する。
 * - それ以外（自分所有の親 / 新規親）は全 note を editor 所有として作成する
 *   （own-row 更新時は呼び出し側 UseCase が自分の既存 note を事前に deleteMany 済み）。
 *
 * 親ごとに delegate（FK 名・prisma モデル）が異なる差分は ops コールバックで吸収する。
 */
export type ChildNoteOps = {
  isPassThrough: boolean;
  updateSortOrder: (id: string, sortOrder: number) => Promise<unknown>;
  create: (ownerId: string, text: string, sortOrder: number) => Promise<unknown>;
};

export async function upsertChildNotes(
  ctx: EditorContext,
  notes: ReadonlyArray<NoteValue>,
  ops: ChildNoteOps,
): Promise<void> {
  for (let j = 0; j < notes.length; j++) {
    const n = notes[j];
    const trimmed = n.text.trim();
    if (trimmed.length === 0) continue;
    if (ops.isPassThrough && n.id && isSystemOwned(n.ownerId)) {
      await ops.updateSortOrder(n.id, j);
    } else {
      await ops.create(ctx.userId, trimmed, j);
    }
  }
}
