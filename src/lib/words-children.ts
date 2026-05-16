import "server-only";

import { prisma } from "@/lib/prisma";

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
  if (values.meanings.length > 0) {
    await tx.meaning.createMany({
      data: values.meanings.map((m, i) => ({
        wordId,
        ownerId: userId,
        partOfSpeech: nullable(m.partOfSpeech),
        pronunciation: nullable(m.pronunciation),
        text: m.text.trim(),
        note: nullable(m.note),
        sortOrder: i,
      })),
    });
  }

  if (values.examples.length > 0) {
    await tx.example.createMany({
      data: values.examples.map((e, i) => ({
        wordId,
        ownerId: userId,
        kind: e.kind,
        text: e.text.trim(),
        meaning: nullable(e.meaning),
        note: nullable(e.note),
        sortOrder: i,
      })),
    });
  }

  if (values.relatedWords.length > 0) {
    await tx.relatedWord.createMany({
      data: values.relatedWords.map((r, i) => ({
        wordId,
        ownerId: userId,
        kind: r.kind ?? null,
        term: r.term.trim(),
        partOfSpeech: nullable(r.partOfSpeech),
        pronunciation: nullable(r.pronunciation),
        meaning: nullable(r.meaning),
        note: nullable(r.note),
        sortOrder: i,
        linkedWordId:
          r.linkedWordId && allowed.linkedWordIds.has(r.linkedWordId) ? r.linkedWordId : null,
      })),
    });
  }

  if (values.memos.length > 0) {
    await tx.memo.createMany({
      data: values.memos.map((m, i) => ({
        wordId,
        ownerId: userId,
        text: m.text.trim(),
        sortOrder: i,
      })),
    });
  }

  const seenOccurrenceIds = new Set<string>();
  for (let i = 0; i < values.occurrences.length; i++) {
    const oc = values.occurrences[i];

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
      data: { wordId, occurrenceId, ownerId: userId, sortOrder: i },
      select: { id: true },
    });

    const details = oc.details.map((d) => (d.detail ?? "").trim()).filter((d) => d.length > 0);
    if (details.length > 0) {
      await tx.occurrenceDetail.createMany({
        data: details.map((detail, di) => ({
          wordOccurrenceId: wordOccurrence.id,
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
