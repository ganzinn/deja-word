import "server-only";

import { isUniqueConstraintOn } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";
import { DuplicateHeadwordError, DuplicateOccurrenceNumberError } from "@/lib/words-create";
import { editorContextFor, resolveChildAllowedIds, writeWordChildren } from "@/lib/words/handlers";
import { deleteOrphanedEditorOwned } from "@/lib/words/handlers/orphan-delete";
import { assertWordUpdateAllowed, ForbiddenUpdateError } from "@/lib/words/policy/row-policy";

import type { WordFormValues } from "@/lib/schema/word-form";

export class WordNotFoundError extends Error {
  constructor() {
    super("WORD_NOT_FOUND");
    this.name = "WordNotFoundError";
  }
}

export { DuplicateHeadwordError, DuplicateOccurrenceNumberError, ForbiddenUpdateError };

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

  const ctx = editorContextFor(userId);
  const wordOwnedByEditor = existing.ownerId === userId;

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

  assertWordUpdateAllowed(ctx, existing, values, {
    meanings: existingMeanings,
    examples: existingExamples,
    relatedWords: existingRelated,
    memos: existingMemos,
    wordOccurrences: existingWordOccurrences,
    meaningTexts: existingMeaningTexts,
    occurrenceDetails: existingOccurrenceDetails,
  });

  const meaningIdsInForm = collectIds(values.meanings);
  const exampleIdsInForm = collectIds(values.examples);
  const relatedIdsInForm = collectIds(values.relatedWords);
  const memoIdsInForm = collectIds(values.memos);
  const wordOccurrenceIdsInForm = collectIds(values.occurrences);

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

      await writeWordChildren(tx, ctx, wordId, values, allowed);

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
