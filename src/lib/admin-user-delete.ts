import "server-only";

import { defaultBlobClient, type BlobClient } from "@/lib/blob-client";
import { bestEffortDeleteAudioUrls } from "@/lib/pronunciation-audio";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

export class UserNotFoundError extends Error {
  constructor() {
    super("USER_NOT_FOUND");
    this.name = "UserNotFoundError";
  }
}

/**
 * 管理者によるユーザー削除。User の全子リレーションは onDelete: Cascade のため
 * DB は `prisma.user.delete()` 一発でクリーンになるが、発音音源（Meaning /
 * RelatedWord の pronunciationAudioUrl）の Blob 実体は cascade で消えないため、
 * 削除前に URL を収集し、delete 成功後にベストエフォートで後始末する
 * （`words-delete.ts` と同じ方針）。
 */
export async function deleteUserForAdmin(
  userId: string,
  blob: BlobClient = defaultBlobClient,
): Promise<void> {
  // system ユーザーは削除不可（service 層でも防御）。
  if (userId === SYSTEM_USER_ID) throw new UserNotFoundError();

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw new UserNotFoundError();

  // onDelete: Cascade は Blob に効かないため、削除前に配下の音源 URL を収集する。
  const [meanings, relatedWords] = await Promise.all([
    prisma.meaning.findMany({
      where: { ownerId: userId },
      select: { pronunciationAudioUrl: true },
    }),
    prisma.relatedWord.findMany({
      where: { ownerId: userId },
      select: { pronunciationAudioUrl: true },
    }),
  ]);

  await prisma.user.delete({ where: { id: userId } });

  // DB を真実とし、delete 成功後にベストエフォートで Blob を消す。
  await bestEffortDeleteAudioUrls(
    [...meanings, ...relatedWords].map((row) => row.pronunciationAudioUrl),
    blob,
  );
}
