import "server-only";

import { isPassThroughSystemRow } from "@/lib/words/policy/row-policy";

import { nullable, type EditorContext, type Tx } from "./shared";

import type { WordFormValues } from "@/lib/schema/word-form";

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

    // 共通行の pass-through: 並び順だけ更新（本文は触らない）
    if (r.id && isPassThroughSystemRow(ctx, r.ownerId)) {
      await tx.relatedWord.update({
        where: { id: r.id },
        data: { sortOrder: i },
        select: { id: true },
      });
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
          note: nullable(r.note),
          sortOrder: i,
          linkedWordId,
        },
        select: { id: true },
      });
      continue;
    }

    await tx.relatedWord.create({
      data: {
        wordId: opts.wordId,
        ownerId: ctx.userId,
        kind: r.kind ?? null,
        term: r.term.trim(),
        partOfSpeech: nullable(r.partOfSpeech),
        pronunciation: nullable(r.pronunciation),
        meaning: nullable(r.meaning),
        note: nullable(r.note),
        sortOrder: i,
        linkedWordId,
      },
      select: { id: true },
    });
  }
}
