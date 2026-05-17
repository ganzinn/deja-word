import "server-only";

import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import type { WordFormValues } from "@/lib/schema/word-form";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export type ChildAllowedIds = {
  linkedWordIds: Set<string>;
  presetOccurrenceIds: Set<string>;
};

export async function resolveChildAllowedIds(
  _userId: string,
  values: WordFormValues,
  allowedOwnerIds: string[],
): Promise<ChildAllowedIds> {
  const linkedWordIds = uniqueStrings(values.relatedWords.map((r) => r.linkedWordId));
  const presetOccurrenceIds = uniqueStrings(values.occurrences.map((o) => o.occurrenceId));

  const [linkedWords, presetOccurrences] = await Promise.all([
    linkedWordIds.length > 0
      ? prisma.word.findMany({
          where: { id: { in: linkedWordIds }, ownerId: { in: allowedOwnerIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    presetOccurrenceIds.length > 0
      ? prisma.occurrence.findMany({
          where: { id: { in: presetOccurrenceIds }, ownerId: { in: allowedOwnerIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    linkedWordIds: new Set(linkedWords.map((w) => w.id)),
    presetOccurrenceIds: new Set(presetOccurrences.map((o) => o.id)),
  };
}

export async function createWordChildren(
  tx: Tx,
  wordId: string,
  userId: string,
  values: WordFormValues,
  allowed: ChildAllowedIds,
): Promise<void> {
  const editorIsSystem = userId === SYSTEM_USER_ID;

  for (let i = 0; i < values.meanings.length; i++) {
    const m = values.meanings[i];

    if (m.id && m.ownerId === SYSTEM_USER_ID && !editorIsSystem) {
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
            data: { meaningId: m.id, ownerId: userId, text: trimmed, sortOrder: j },
            select: { id: true },
          });
        }
      }
      continue;
    }

    if (m.id && m.ownerId === userId) {
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
            ownerId: userId,
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
        wordId,
        ownerId: userId,
        partOfSpeech: nullable(m.partOfSpeech),
        pronunciation: nullable(m.pronunciation),
        note: nullable(m.note),
        sortOrder: i,
        texts: {
          createMany: {
            data: texts.map((text, j) => ({ ownerId: userId, text, sortOrder: j })),
          },
        },
      },
      select: { id: true },
    });
  }

  for (let i = 0; i < values.examples.length; i++) {
    const e = values.examples[i];

    if (e.id && e.ownerId === SYSTEM_USER_ID && !editorIsSystem) {
      await tx.example.update({
        where: { id: e.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      continue;
    }

    if (e.id && e.ownerId === userId) {
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
        wordId,
        ownerId: userId,
        kind: e.kind,
        text: e.text.trim(),
        meaning: nullable(e.meaning),
        note: nullable(e.note),
        sortOrder: i,
      },
      select: { id: true },
    });
  }

  for (let i = 0; i < values.relatedWords.length; i++) {
    const r = values.relatedWords[i];
    const linkedWordId =
      r.linkedWordId && allowed.linkedWordIds.has(r.linkedWordId) ? r.linkedWordId : null;

    if (r.id && r.ownerId === SYSTEM_USER_ID && !editorIsSystem) {
      await tx.relatedWord.update({
        where: { id: r.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      continue;
    }

    if (r.id && r.ownerId === userId) {
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
        wordId,
        ownerId: userId,
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

  for (let i = 0; i < values.memos.length; i++) {
    const m = values.memos[i];

    if (m.id && m.ownerId === SYSTEM_USER_ID && !editorIsSystem) {
      await tx.memo.update({
        where: { id: m.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      continue;
    }

    if (m.id && m.ownerId === userId) {
      await tx.memo.update({
        where: { id: m.id },
        data: { text: m.text.trim(), sortOrder: i },
        select: { id: true },
      });
      continue;
    }

    await tx.memo.create({
      data: { wordId, ownerId: userId, text: m.text.trim(), sortOrder: i },
      select: { id: true },
    });
  }

  const seenOccurrenceIds = new Set<string>();
  for (let i = 0; i < values.occurrences.length; i++) {
    const oc = values.occurrences[i];

    if (oc.id && oc.ownerId === SYSTEM_USER_ID && !editorIsSystem) {
      await tx.wordOccurrence.update({
        where: { id: oc.id },
        data: { sortOrder: i },
        select: { id: true },
      });
      for (let j = 0; j < oc.details.length; j++) {
        const d = oc.details[j];
        const detailText = (d.detail ?? "").trim();
        if (detailText.length === 0) continue;
        if (d.id && d.ownerId === SYSTEM_USER_ID) {
          await tx.occurrenceDetail.update({
            where: { id: d.id },
            data: { sortOrder: j },
            select: { id: true },
          });
        } else {
          await tx.occurrenceDetail.create({
            data: {
              wordOccurrenceId: oc.id,
              ownerId: userId,
              detail: detailText,
              sortOrder: j,
            },
            select: { id: true },
          });
        }
      }
      continue;
    }

    if (oc.id && oc.ownerId === userId && editorIsSystem) {
      await tx.wordOccurrence.update({
        where: { id: oc.id },
        data: {
          sortOrder: i,
          occurrenceNumber: oc.occurrenceNumber ?? null,
        },
        select: { id: true },
      });
      const details = oc.details.map((d) => (d.detail ?? "").trim()).filter((d) => d.length > 0);
      if (details.length > 0) {
        await tx.occurrenceDetail.createMany({
          data: details.map((detail, di) => ({
            wordOccurrenceId: oc.id!,
            ownerId: userId,
            detail,
            sortOrder: di,
          })),
        });
      }
      continue;
    }

    if (oc.id && oc.ownerId === userId && !editorIsSystem) {
      await tx.wordOccurrence.delete({ where: { id: oc.id } });
    }

    let occurrenceId: string;
    if (oc.occurrenceId && allowed.presetOccurrenceIds.has(oc.occurrenceId)) {
      occurrenceId = oc.occurrenceId;
    } else {
      const location = oc.location.trim();
      if (location === "") continue;
      const upserted = await tx.occurrence.upsert({
        where: { ownerId_location: { ownerId: userId, location } },
        create: { ownerId: userId, location },
        update: {},
        select: { id: true },
      });
      occurrenceId = upserted.id;
    }

    if (seenOccurrenceIds.has(occurrenceId)) continue;
    seenOccurrenceIds.add(occurrenceId);

    const wordOccurrence = await tx.wordOccurrence.create({
      data: {
        wordId,
        occurrenceId,
        ownerId: userId,
        sortOrder: i,
        occurrenceNumber: oc.occurrenceNumber ?? null,
      },
      select: { id: true },
    });

    const details = oc.details.map((d) => (d.detail ?? "").trim()).filter((d) => d.length > 0);
    if (details.length > 0) {
      await tx.occurrenceDetail.createMany({
        data: details.map((detail, di) => ({
          wordOccurrenceId: wordOccurrence.id,
          ownerId: userId,
          detail,
          sortOrder: di,
        })),
      });
    }
  }
}

function nullable(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function uniqueStrings(values: ReadonlyArray<string | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string")));
}
