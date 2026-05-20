import "server-only";

import { isPassThroughSystemRow } from "@/lib/words/policy/row-policy";

import { nullable, type EditorContext, type Tx } from "./shared";

import type { WordFormValues } from "@/lib/schema/word-form";

export async function upsertExamples(
  tx: Tx,
  ctx: EditorContext,
  rows: WordFormValues["examples"],
  opts: { wordId: string },
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];

    // 共通行の pass-through: 並び順だけ更新（本文は触らない）
    if (e.id && isPassThroughSystemRow(ctx, e.ownerId)) {
      await tx.example.update({
        where: { id: e.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      continue;
    }

    if (e.id && e.ownerId === ctx.userId) {
      await tx.example.update({
        where: { id: e.id },
        data: {
          kind: e.kind,
          text: e.text.trim(),
          meaning: nullable(e.meaning),
          note: nullable(e.note),
          sortOrder: i,
        },
        select: { id: true },
      });
      continue;
    }

    await tx.example.create({
      data: {
        wordId: opts.wordId,
        ownerId: ctx.userId,
        kind: e.kind,
        text: e.text.trim(),
        meaning: nullable(e.meaning),
        note: nullable(e.note),
        sortOrder: i,
      },
      select: { id: true },
    });
  }
}
