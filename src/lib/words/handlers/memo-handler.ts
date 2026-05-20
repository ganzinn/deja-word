import "server-only";

import { SYSTEM_USER_ID } from "@/lib/system-user";

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
    if (m.id && m.ownerId === SYSTEM_USER_ID && !ctx.isSystem) {
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
