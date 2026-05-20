import "server-only";

import { isUniqueConstraintOn } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID, scopedOwnerIds } from "@/lib/system-user";
import {
  DuplicateHeadwordError,
  DuplicateOccurrenceNumberError,
} from "@/lib/words-create";
import { editorContextFor, resolveChildAllowedIds, writeWordChildren } from "@/lib/words/handlers";

import type { Prisma } from "@/generated/prisma/client";
import type { WordFormValues } from "@/lib/schema/word-form";

export class WordNotFoundError extends Error {
  constructor() {
    super("WORD_NOT_FOUND");
    this.name = "WordNotFoundError";
  }
}

export class ForbiddenUpdateError extends Error {
  constructor(reason: string) {
    super(`FORBIDDEN_UPDATE: ${reason}`);
    this.name = "ForbiddenUpdateError";
  }
}

export { DuplicateHeadwordError, DuplicateOccurrenceNumberError };

type EntityKey = "meaning" | "example" | "relatedWord" | "memo" | "wordOccurrence";

type FormRowsByEntity = {
  meaning: WordFormValues["meanings"];
  example: WordFormValues["examples"];
  relatedWord: WordFormValues["relatedWords"];
  memo: WordFormValues["memos"];
  wordOccurrence: WordFormValues["occurrences"];
};

export async function updateWordForUser(
  userId: string,
  wordId: string,
  values: WordFormValues,
): Promise<{ id: string }> {
  const existing = await prisma.word.findFirst({
    where: {
      id: wordId,
      ownerId: { in: scopedOwnerIds(userId) },
    },
    select: { id: true, ownerId: true, headword: true },
  });
  if (!existing) throw new WordNotFoundError();

  const wordIsSystem = existing.ownerId === SYSTEM_USER_ID;
  const editorIsSystem = userId === SYSTEM_USER_ID;
  const wordOwnedByEditor = existing.ownerId === userId;
  if (wordIsSystem && !editorIsSystem && values.headword.trim() !== existing.headword) {
    throw new ForbiddenUpdateError("system word headword cannot be changed");
  }

  const [
    existingMeanings,
    existingExamples,
    existingRelated,
    existingMemos,
    existingWordOccurrences,
  ] = await Promise.all([
    prisma.meaning.findMany({ where: { wordId }, select: { id: true, ownerId: true } }),
    prisma.example.findMany({ where: { wordId }, select: { id: true, ownerId: true } }),
    prisma.relatedWord.findMany({ where: { wordId }, select: { id: true, ownerId: true } }),
    prisma.memo.findMany({ where: { wordId }, select: { id: true, ownerId: true } }),
    prisma.wordOccurrence.findMany({
      where: { wordId },
      select: { id: true, ownerId: true },
    }),
  ]);
  const existingMeaningTexts = await prisma.meaningText.findMany({
    where: { meaning: { wordId } },
    select: { id: true, ownerId: true, meaningId: true },
  });
  const existingOccurrenceDetails = await prisma.occurrenceDetail.findMany({
    where: { wordOccurrence: { wordId } },
    select: { id: true, ownerId: true, wordOccurrenceId: true },
  });

  const formRowsByEntity: FormRowsByEntity = {
    meaning: values.meanings,
    example: values.examples,
    relatedWord: values.relatedWords,
    memo: values.memos,
    wordOccurrence: values.occurrences,
  };
  const dbRowsByEntity: Record<EntityKey, { id: string; ownerId: string }[]> = {
    meaning: existingMeanings,
    example: existingExamples,
    relatedWord: existingRelated,
    memo: existingMemos,
    wordOccurrence: existingWordOccurrences,
  };

  for (const key of Object.keys(formRowsByEntity) as EntityKey[]) {
    assertFormRowsAllowed(key, formRowsByEntity[key], dbRowsByEntity[key], userId, editorIsSystem);
  }

  for (const m of values.meanings) {
    if (!m.id) continue;
    const texts = existingMeaningTexts.filter((t) => t.meaningId === m.id);
    assertFormRowsAllowed("meaningText", m.texts, texts, userId, editorIsSystem);
  }
  for (const oc of values.occurrences) {
    if (!oc.id) continue;
    const details = existingOccurrenceDetails.filter((d) => d.wordOccurrenceId === oc.id);
    assertFormRowsAllowed("occurrenceDetail", oc.details, details, userId, editorIsSystem);
  }

  const meaningIdsInForm = collectIds(values.meanings);
  const exampleIdsInForm = collectIds(values.examples);
  const relatedIdsInForm = collectIds(values.relatedWords);
  const memoIdsInForm = collectIds(values.memos);
  const wordOccurrenceIdsInForm = collectIds(values.occurrences);

  for (const parent of existingMeanings) {
    if (parent.ownerId !== userId) continue;
    if (meaningIdsInForm.has(parent.id)) continue;
    const attachedNonEditor = existingMeaningTexts.some(
      (t) => t.meaningId === parent.id && t.ownerId !== userId,
    );
    if (attachedNonEditor) {
      throw new ForbiddenUpdateError(
        `meaning ${parent.id} has attached non-editor texts; cannot delete`,
      );
    }
  }
  for (const parent of existingWordOccurrences) {
    if (parent.ownerId !== userId) continue;
    if (wordOccurrenceIdsInForm.has(parent.id)) continue;
    const attachedNonEditor = existingOccurrenceDetails.some(
      (d) => d.wordOccurrenceId === parent.id && d.ownerId !== userId,
    );
    if (attachedNonEditor) {
      throw new ForbiddenUpdateError(
        `wordOccurrence ${parent.id} has attached non-editor details; cannot delete`,
      );
    }
  }

  const allowed = await resolveChildAllowedIds(userId, values, scopedOwnerIds(userId));

  try {
    return await prisma.$transaction(async (tx) => {
      if (wordOwnedByEditor) {
        await tx.word.update({
          where: { id: wordId },
          data: { headword: values.headword.trim() },
          select: { id: true },
        });
      }

      await tx.meaningText.deleteMany({
        where: { meaning: { wordId }, ownerId: userId },
      });
      await tx.occurrenceDetail.deleteMany({
        where: { wordOccurrence: { wordId }, ownerId: userId },
      });

      await Promise.all([
        deleteOrphanedEditorOwned(tx, "meaning", wordId, userId, meaningIdsInForm),
        deleteOrphanedEditorOwned(tx, "example", wordId, userId, exampleIdsInForm),
        deleteOrphanedEditorOwned(tx, "relatedWord", wordId, userId, relatedIdsInForm),
        deleteOrphanedEditorOwned(tx, "memo", wordId, userId, memoIdsInForm),
        deleteOrphanedEditorOwned(tx, "wordOccurrence", wordId, userId, wordOccurrenceIdsInForm),
      ]);

      await writeWordChildren(tx, editorContextFor(userId), wordId, values, allowed);

      return { id: wordId };
    });
  } catch (e) {
    if (isUniqueConstraintOn(e, "Word")) {
      throw new DuplicateHeadwordError();
    }
    if (isUniqueConstraintOn(e, "WordOccurrence")) {
      throw new DuplicateOccurrenceNumberError();
    }
    throw e;
  }
}

function collectIds(rows: ReadonlyArray<{ id?: string }>): Set<string> {
  return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
}

async function deleteOrphanedEditorOwned(
  tx: Prisma.TransactionClient,
  entity: EntityKey,
  wordId: string,
  userId: string,
  idsInForm: Set<string>,
): Promise<void> {
  const ids = Array.from(idsInForm);
  const where = {
    wordId,
    ownerId: userId,
    ...(ids.length > 0 ? { id: { notIn: ids } } : {}),
  };
  switch (entity) {
    case "meaning":
      await tx.meaning.deleteMany({ where });
      return;
    case "example":
      await tx.example.deleteMany({ where });
      return;
    case "relatedWord":
      await tx.relatedWord.deleteMany({ where });
      return;
    case "memo":
      await tx.memo.deleteMany({ where });
      return;
    case "wordOccurrence":
      await tx.wordOccurrence.deleteMany({ where });
      return;
  }
}

function assertFormRowsAllowed(
  entity: string,
  formRows: ReadonlyArray<{ id?: string; ownerId?: string }>,
  dbRows: ReadonlyArray<{ id: string; ownerId: string }>,
  userId: string,
  editorIsSystem: boolean,
): void {
  const dbById = new Map(dbRows.map((r) => [r.id, r.ownerId]));
  const formIds = new Set<string>();

  for (const row of formRows) {
    if (row.id) {
      formIds.add(row.id);
      const dbOwner = dbById.get(row.id);
      if (!dbOwner) {
        throw new ForbiddenUpdateError(`${entity}: unknown id ${row.id}`);
      }
      if (row.ownerId !== dbOwner) {
        throw new ForbiddenUpdateError(`${entity}: owner mismatch on ${row.id}`);
      }
    }

    if (row.ownerId && row.ownerId !== "") {
      const isOwn = row.ownerId === userId;
      const isPassthrough = row.ownerId === SYSTEM_USER_ID && !editorIsSystem;
      if (!isOwn && !isPassthrough) {
        throw new ForbiddenUpdateError(`${entity}: ownerId ${row.ownerId} not allowed for editor`);
      }
    }
  }

  if (!editorIsSystem) {
    for (const dbRow of dbRows) {
      if (dbRow.ownerId === SYSTEM_USER_ID && !formIds.has(dbRow.id)) {
        throw new ForbiddenUpdateError(`${entity}: system row ${dbRow.id} cannot be deleted`);
      }
    }
  }
}
