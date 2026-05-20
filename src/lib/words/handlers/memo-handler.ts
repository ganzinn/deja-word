import "server-only";

import { isPassThroughSystemRow } from "@/lib/words/policy/row-policy";

import type { EditorContext, Tx } from "./shared";

import type { WordFormValues } from "@/lib/schema/word-form";

export async function upsertMemos(
  tx: Tx,
  ctx: EditorContext,
  rows: WordFormValues["memos"],
  opts: { wordId: string },
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];

    // 共通行の pass-through: 並び順だけ更新（本文は触らない）
    if (m.id && isPassThroughSystemRow(ctx, m.ownerId)) {
      await tx.memo.update({
        where: { id: m.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      continue;
    }

    if (m.id && m.ownerId === ctx.userId) {
      await tx.memo.update({
        where: { id: m.id },
        data: { text: m.text.trim(), sortOrder: i },
        select: { id: true },
      });
      continue;
    }

    await tx.memo.create({
      data: { wordId: opts.wordId, ownerId: ctx.userId, text: m.text.trim(), sortOrder: i },
      select: { id: true },
    });
  }
}
