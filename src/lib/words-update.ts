import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";
import {
  DuplicateHeadwordError,
  DuplicateOccurrenceNumberError,
  isDuplicateHeadword,
  isDuplicateOccurrenceNumber,
} from "@/lib/words-create";
import { createWordChildren, resolveChildAllowedIds } from "@/lib/words-children";

import type { WordFormValues } from "@/lib/schema/word-form";

export type UpdateWordError =
  | "unauthorized"
  | "invalid"
  | "not_found"
  | "duplicate"
  | "duplicate_occurrence_number"
  | "unknown";

export class WordNotFoundError extends Error {
  constructor() {
    super("WORD_NOT_FOUND");
    this.name = "WordNotFoundError";
  }
}

export { DuplicateHeadwordError, DuplicateOccurrenceNumberError };

export async function updateWordForUser(
  userId: string,
  wordId: string,
  values: WordFormValues,
): Promise<{ id: string }> {
  const existing = await prisma.word.findFirst({
    where: { id: wordId, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new WordNotFoundError();

  const allowed = await resolveChildAllowedIds(userId, values, scopedOwnerIds(userId));

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.word.update({
        where: { id: wordId },
        data: { headword: values.headword.trim() },
        select: { id: true },
      });

      await Promise.all([
        tx.meaning.deleteMany({ where: { wordId } }),
        tx.example.deleteMany({ where: { wordId } }),
        tx.relatedWord.deleteMany({ where: { wordId } }),
        tx.memo.deleteMany({ where: { wordId } }),
        tx.wordOccurrence.deleteMany({ where: { wordId } }),
      ]);

      await createWordChildren(tx, wordId, userId, values, allowed);

      return { id: wordId };
    });
  } catch (e) {
    if (isDuplicateHeadword(e)) {
      throw new DuplicateHeadwordError();
    }
    if (isDuplicateOccurrenceNumber(e)) {
      throw new DuplicateOccurrenceNumberError();
    }
    throw e;
  }
}
