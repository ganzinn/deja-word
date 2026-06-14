import "server-only";

import { isPassThroughSystemRow, isSystemOwned } from "@/lib/words/policy/row-policy";

import { upsertChildNotes, type ChildNoteOps } from "./note-children";
import { nullable, type EditorContext, type Tx } from "./shared";

import type { WordFormValues } from "@/lib/schema/word-form";

function meaningNoteOps(tx: Tx, meaningId: string, isPassThrough: boolean): ChildNoteOps {
  return {
    isPassThrough,
    updateSortOrder: (id, sortOrder) =>
      tx.meaningNote.update({ where: { id }, data: { sortOrder }, select: { id: true } }),
    create: (ownerId, text, sortOrder) =>
      tx.meaningNote.create({
        data: { meaningId, ownerId, text, sortOrder },
        select: { id: true },
      }),
  };
}

export async function upsertMeanings(
  tx: Tx,
  ctx: EditorContext,
  rows: WordFormValues["meanings"],
  opts: { wordId: string },
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];

    // 共通（system 所有）行の pass-through: 並び順だけ更新し、自分のテキストを追記する
    if (m.id && isPassThroughSystemRow(ctx, m.ownerId)) {
      await tx.meaning.update({
        where: { id: m.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      for (let j = 0; j < m.texts.length; j++) {
        const t = m.texts[j];
        const trimmed = t.text.trim();
        if (trimmed.length === 0) continue;
        if (t.id && isSystemOwned(t.ownerId)) {
          await tx.meaningText.update({
            where: { id: t.id },
            data: { sortOrder: j },
            select: { id: true },
          });
        } else {
          await tx.meaningText.create({
            data: { meaningId: m.id, ownerId: ctx.userId, text: trimmed, sortOrder: j },
            select: { id: true },
          });
        }
      }
      await upsertChildNotes(ctx, m.notes, meaningNoteOps(tx, m.id, true));
      continue;
    }

    if (m.id && m.ownerId === ctx.userId) {
      await tx.meaning.update({
        where: { id: m.id },
        data: {
          partOfSpeech: nullable(m.partOfSpeech),
          pronunciation: nullable(m.pronunciation),
          sortOrder: i,
        },
        select: { id: true },
      });
      const texts = m.texts.map((t) => t.text.trim()).filter((text) => text.length > 0);
      if (texts.length > 0) {
        await tx.meaningText.createMany({
          data: texts.map((text, j) => ({
            meaningId: m.id!,
            ownerId: ctx.userId,
            text,
            sortOrder: j,
          })),
        });
      }
      await upsertChildNotes(ctx, m.notes, meaningNoteOps(tx, m.id, false));
      continue;
    }

    const texts = m.texts.map((t) => t.text.trim()).filter((text) => text.length > 0);
    if (texts.length === 0) continue;
    const created = await tx.meaning.create({
      data: {
        wordId: opts.wordId,
        ownerId: ctx.userId,
        partOfSpeech: nullable(m.partOfSpeech),
        pronunciation: nullable(m.pronunciation),
        sortOrder: i,
        texts: {
          createMany: {
            data: texts.map((text, j) => ({ ownerId: ctx.userId, text, sortOrder: j })),
          },
        },
      },
      select: { id: true },
    });
    await upsertChildNotes(ctx, m.notes, meaningNoteOps(tx, created.id, false));
  }
}
