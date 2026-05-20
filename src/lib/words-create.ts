import "server-only";

import { isUniqueConstraintOn } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID, scopedOwnerIds } from "@/lib/system-user";
import {
  editorContextFor,
  resolveChildAllowedIds,
  writeWordChildren,
  type ChildAllowedIds,
} from "@/lib/words/handlers";
import { mergeWordInto } from "@/lib/words-merge";

import type { Prisma } from "@/generated/prisma/client";
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
      if (ctx.isSystem) {
        return await createWordAsSystem(tx, headword, values, allowed);
      }
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

// system principal として共通単語を生成/マージするパス。ここで参照する
// SYSTEM_USER_ID は「行レベルの認可判定」ではなく「書き込む owner（データ値）」であり、
// policy/ への集約対象外（フェーズ 4 の許容例外）。
async function createWordAsSystem(
  tx: Prisma.TransactionClient,
  headword: string,
  values: WordFormValues,
  allowed: ChildAllowedIds,
): Promise<{ id: string }> {
  const sysExisting = await tx.word.findUnique({
    where: { ownerId_headword: { ownerId: SYSTEM_USER_ID, headword } },
    select: { id: true },
  });
  if (sysExisting) {
    throw new DuplicateHeadwordError();
  }

  const nonSystem = await tx.word.findMany({
    where: { headword, ownerId: { not: SYSTEM_USER_ID } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (nonSystem.length === 0) {
    const word = await tx.word.create({
      data: { ownerId: SYSTEM_USER_ID, headword },
      select: { id: true },
    });
    await writeWordChildren(tx, editorContextFor(SYSTEM_USER_ID), word.id, values, allowed);
    return word;
  }

  const [primary, ...others] = nonSystem;
  for (const other of others) {
    await mergeWordInto(tx, other.id, primary.id);
  }

  await tx.word.update({
    where: { id: primary.id },
    data: { ownerId: SYSTEM_USER_ID },
    select: { id: true },
  });

  await writeWordChildren(tx, editorContextFor(SYSTEM_USER_ID), primary.id, values, allowed);
  return { id: primary.id };
}
