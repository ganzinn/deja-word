import "server-only";

import { prisma } from "@/lib/prisma";
import { WordNotFoundError } from "@/lib/words-update";

export type DeleteWordError = "unauthorized" | "not_found" | "unknown";

export { WordNotFoundError };

export async function deleteWordForUser(userId: string, wordId: string): Promise<void> {
  const existing = await prisma.word.findFirst({
    where: { id: wordId, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new WordNotFoundError();

  await prisma.word.delete({ where: { id: wordId } });
}

export async function countIncomingLinksForUser(userId: string, wordId: string): Promise<number> {
  return prisma.relatedWord.count({
    where: {
      linkedWordId: wordId,
      ownerId: userId,
      NOT: { wordId },
    },
  });
}
