import "server-only";

import { isPassThroughSystemRow } from "@/lib/words/policy/row-policy";

import { upsertChildNotes, type ChildNoteOps } from "./note-children";
import { nullable, type EditorContext, type Tx } from "./shared";

import type { WordFormValues } from "@/lib/schema/word-form";

function exampleNoteOps(tx: Tx, exampleId: string, isPassThrough: boolean): ChildNoteOps {
  return {
    isPassThrough,
    updateSortOrder: (id, sortOrder) =>
      tx.exampleNote.update({ where: { id }, data: { sortOrder }, select: { id: true } }),
    create: (ownerId, text, sortOrder) =>
      tx.exampleNote.create({
        data: { exampleId, ownerId, text, sortOrder },
        select: { id: true },
      }),
  };
}

export async function upsertExamples(
  tx: Tx,
  ctx: EditorContext,
  rows: WordFormValues["examples"],
  opts: { wordId: string },
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];

    // 共通行の pass-through: 本文は触らず並び順のみ。自分の補足説明は追記できる。
    if (e.id && isPassThroughSystemRow(ctx, e.ownerId)) {
      await tx.example.update({
        where: { id: e.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      await upsertChildNotes(ctx, e.notes, exampleNoteOps(tx, e.id, true));
      continue;
    }

    if (e.id && e.ownerId === ctx.userId) {
      await tx.example.update({
        where: { id: e.id },
        data: {
          kind: e.kind,
          text: e.text.trim(),
          meaning: nullable(e.meaning),
          sortOrder: i,
        },
        select: { id: true },
      });
      await upsertChildNotes(ctx, e.notes, exampleNoteOps(tx, e.id, false));
      continue;
    }

    const created = await tx.example.create({
      data: {
        wordId: opts.wordId,
        ownerId: ctx.userId,
        kind: e.kind,
        text: e.text.trim(),
        meaning: nullable(e.meaning),
        sortOrder: i,
      },
      select: { id: true },
    });
    await upsertChildNotes(ctx, e.notes, exampleNoteOps(tx, created.id, false));
  }
}
