import "server-only";

import { defaultBlobClient, type BlobClient } from "@/lib/blob-client";
import { bestEffortDeleteAudioUrls } from "@/lib/meaning-audio";
import { prisma } from "@/lib/prisma";
import { WordNotFoundError } from "@/lib/words-update";

export type DeleteWordError = "unauthorized" | "not_found" | "unknown";

export { WordNotFoundError };

export async function deleteWordForUser(
  userId: string,
  wordId: string,
  blob: BlobClient = defaultBlobClient,
): Promise<void> {
  const existing = await prisma.word.findFirst({
    where: { id: wordId, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new WordNotFoundError();

  // onDelete: Cascade は Blob に効かないため、削除前に配下 Meaning の音源 URL を収集する。
  const meanings = await prisma.meaning.findMany({
    where: { wordId },
    select: { pronunciationAudioUrl: true },
  });

  await prisma.word.delete({ where: { id: wordId } });

  // DB を真実とし、delete 成功後にベストエフォートで Blob を消す。
  await bestEffortDeleteAudioUrls(
    meanings.map((m) => m.pronunciationAudioUrl),
    blob,
  );
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
