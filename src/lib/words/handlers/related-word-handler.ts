import "server-only";

import { isPassThroughSystemRow } from "@/lib/words/policy/row-policy";

import { upsertChildNotes, type ChildNoteOps } from "./note-children";
import { nullable, type EditorContext, type Tx } from "./shared";

import type { WordFormValues } from "@/lib/schema/word-form";

function relatedWordNoteOps(tx: Tx, relatedWordId: string, isPassThrough: boolean): ChildNoteOps {
  return {
    isPassThrough,
    updateSortOrder: (id, sortOrder) =>
      tx.relatedWordNote.update({ where: { id }, data: { sortOrder }, select: { id: true } }),
    create: (ownerId, text, sortOrder) =>
      tx.relatedWordNote.create({
        data: { relatedWordId, ownerId, text, sortOrder },
        select: { id: true },
      }),
  };
}

export async function upsertRelatedWords(
  tx: Tx,
  ctx: EditorContext,
  rows: WordFormValues["relatedWords"],
  opts: { wordId: string; allowedLinkedIds: Set<string> },
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const linkedWordId =
      r.linkedWordId && opts.allowedLinkedIds.has(r.linkedWordId) ? r.linkedWordId : null;

    // 共通行の pass-through: 本文は触らず並び順のみ。自分の補足説明は追記できる。
    if (r.id && isPassThroughSystemRow(ctx, r.ownerId)) {
      await tx.relatedWord.update({
        where: { id: r.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      await upsertChildNotes(ctx, r.notes, relatedWordNoteOps(tx, r.id, true));
      continue;
    }

    if (r.id && r.ownerId === ctx.userId) {
      await tx.relatedWord.update({
        where: { id: r.id },
        data: {
          kind: r.kind ?? null,
          term: r.term.trim(),
          partOfSpeech: nullable(r.partOfSpeech),
          pronunciation: nullable(r.pronunciation),
          meaning: nullable(r.meaning),
          sortOrder: i,
          linkedWordId,
        },
        select: { id: true },
      });
      await upsertChildNotes(ctx, r.notes, relatedWordNoteOps(tx, r.id, false));
      continue;
    }

    const created = await tx.relatedWord.create({
      data: {
        wordId: opts.wordId,
        ownerId: ctx.userId,
        kind: r.kind ?? null,
        term: r.term.trim(),
        partOfSpeech: nullable(r.partOfSpeech),
        pronunciation: nullable(r.pronunciation),
        meaning: nullable(r.meaning),
        sortOrder: i,
        linkedWordId,
      },
      select: { id: true },
    });
    await upsertChildNotes(ctx, r.notes, relatedWordNoteOps(tx, created.id, false));
  }
}
