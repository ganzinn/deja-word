import "server-only";

import { isUniqueConstraintOn } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";
import { editorContextFor, resolveChildAllowedIds, writeWordChildren } from "@/lib/words/handlers";

import type { WordFormValues } from "@/lib/schema/word-form";

export class DuplicateHeadwordError extends Error {
  constructor() {
    super("DUPLICATE_HEADWORD");
    this.name = "DuplicateHeadwordError";
  }
}

export class DuplicateOccurrenceNumberError extends Error {
  constructor() {
    super("DUPLICATE_OCCURRENCE_NUMBER");
    this.name = "DuplicateOccurrenceNumberError";
  }
}

// system・一般ともに単語は「単独作成」する。同名の system 単語と私有単語が
// 共存できるのは意図的な仕様であり（ADR-0062）、作成時に他 owner の単語へ触れない。
// ownerId は編集者自身（system principal のときは SYSTEM_USER_ID が userId として渡る）。
export async function createWordForUser(
  userId: string,
  values: WordFormValues,
): Promise<{ id: string }> {
  const headword = values.headword.trim();
  const ctx = editorContextFor(userId);
  const allowedOwnerIds = scopedOwnerIds(userId);
  const allowed = await resolveChildAllowedIds(userId, values, allowedOwnerIds);

  try {
    return await prisma.$transaction(async (tx) => {
      const word = await tx.word.create({
        data: { ownerId: userId, headword },
        select: { id: true },
      });
      await writeWordChildren(tx, ctx, word.id, values, allowed);
      return word;
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
