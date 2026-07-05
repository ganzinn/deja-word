import "server-only";

import { defaultBlobClient, type BlobClient } from "@/lib/blob-client";
import { bestEffortDeleteAudioUrls } from "@/lib/pronunciation-audio";
import { prisma } from "@/lib/prisma";
import { ForbiddenDeleteError, assertWordDeletable } from "@/lib/words/policy/row-policy";
import { WordNotFoundError } from "@/lib/words-update";

export type DeleteWordError = "unauthorized" | "not_found" | "forbidden" | "unknown";

export { WordNotFoundError, ForbiddenDeleteError };

export async function deleteWordForUser(
  userId: string,
  wordId: string,
  blob: BlobClient = defaultBlobClient,
): Promise<void> {
  const existing = await prisma.word.findFirst({
    where: { id: wordId, ownerId: userId },
    select: { id: true, ownerId: true },
  });
  if (!existing) throw new WordNotFoundError();

  // 削除ガード（ADR-0066）: pass-through で他ユーザーが付けた子孫があると、
  // Cascade でその私物が巻き添えに消える。word の owner 以外が所有する子孫が
  // 1 件でもあれば削除を拒否する。owner 系の 10 テーブルを distinct owner で走査。
  const descendantOwnerRows = await Promise.all([
    prisma.meaning.findMany({
      where: { wordId },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
    prisma.example.findMany({
      where: { wordId },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
    prisma.relatedWord.findMany({
      where: { wordId },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
    prisma.memo.findMany({ where: { wordId }, select: { ownerId: true }, distinct: ["ownerId"] }),
    prisma.wordOccurrence.findMany({
      where: { wordId },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
    prisma.meaningText.findMany({
      where: { meaning: { wordId } },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
    prisma.meaningNote.findMany({
      where: { meaning: { wordId } },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
    prisma.exampleNote.findMany({
      where: { example: { wordId } },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
    prisma.relatedWordNote.findMany({
      where: { relatedWord: { wordId } },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
    prisma.occurrenceDetail.findMany({
      where: { wordOccurrence: { wordId } },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
  ]);
  assertWordDeletable(
    existing.ownerId,
    descendantOwnerRows.flat().map((row) => row.ownerId),
  );

  // onDelete: Cascade は Blob に効かないため、削除前に配下の音源 URL（Meaning / 関連語）を収集する。
  const [meanings, relatedWords] = await Promise.all([
    prisma.meaning.findMany({ where: { wordId }, select: { pronunciationAudioUrl: true } }),
    prisma.relatedWord.findMany({ where: { wordId }, select: { pronunciationAudioUrl: true } }),
  ]);

  await prisma.word.delete({ where: { id: wordId } });

  // DB を真実とし、delete 成功後にベストエフォートで Blob を消す。
  await bestEffortDeleteAudioUrls(
    [...meanings, ...relatedWords].map((row) => row.pronunciationAudioUrl),
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
