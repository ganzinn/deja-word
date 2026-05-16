import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";
import { createWordChildren, resolveChildAllowedIds } from "@/lib/words-children";

import type { WordFormValues } from "@/lib/schema/word-form";

export type CreateWordError = "unauthorized" | "invalid" | "duplicate" | "unknown";

export class DuplicateHeadwordError extends Error {
  constructor() {
    super("DUPLICATE_HEADWORD");
    this.name = "DuplicateHeadwordError";
  }
}

export async function createWordForUser(
  userId: string,
  values: WordFormValues,
): Promise<{ id: string }> {
  const allowedOwnerIds = scopedOwnerIds(userId);
  const allowed = await resolveChildAllowedIds(userId, values, allowedOwnerIds);

  try {
    return await prisma.$transaction(async (tx) => {
      const word = await tx.word.create({
        data: { ownerId: userId, headword: values.headword.trim() },
        select: { id: true },
      });
      await createWordChildren(tx, word.id, userId, values, allowed);
      return word;
    });
  } catch (e) {
    if (isDuplicateHeadword(e)) {
      throw new DuplicateHeadwordError();
    }
    throw e;
  }
}

function isDuplicateHeadword(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: unknown; meta?: { modelName?: unknown } };
  if (err.code !== "P2002") return false;
  return err.meta?.modelName === "Word";
}
