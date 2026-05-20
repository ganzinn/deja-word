import "server-only";

import { SYSTEM_USER_ID } from "@/lib/system-user";

import { nullable, type EditorContext, type Tx } from "./shared";

import type { WordFormValues } from "@/lib/schema/word-form";

export async function upsertMeanings(
  tx: Tx,
  ctx: EditorContext,
  rows: WordFormValues["meanings"],
  opts: { wordId: string },
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];

    // 共通（system 所有）行の pass-through: 並び順だけ更新し、自分のテキストを追記する
    if (m.id && m.ownerId === SYSTEM_USER_ID && !ctx.isSystem) {
      await tx.meaning.update({
        where: { id: m.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      for (let j = 0; j < m.texts.length; j++) {
        const t = m.texts[j];
        const trimmed = t.text.trim();
        if (trimmed.length === 0) continue;
        if (t.id && t.ownerId === SYSTEM_USER_ID) {
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
      continue;
    }

    if (m.id && m.ownerId === ctx.userId) {
      await tx.meaning.update({
        where: { id: m.id },
        data: {
          partOfSpeech: nullable(m.partOfSpeech),
          pronunciation: nullable(m.pronunciation),
          note: nullable(m.note),
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
      continue;
    }

    const texts = m.texts.map((t) => t.text.trim()).filter((text) => text.length > 0);
    if (texts.length === 0) continue;
    await tx.meaning.create({
      data: {
        wordId: opts.wordId,
        ownerId: ctx.userId,
        partOfSpeech: nullable(m.partOfSpeech),
        pronunciation: nullable(m.pronunciation),
        note: nullable(m.note),
        sortOrder: i,
        texts: {
          createMany: {
            data: texts.map((text, j) => ({ ownerId: ctx.userId, text, sortOrder: j })),
          },
        },
      },
      select: { id: true },
    });
  }
}
