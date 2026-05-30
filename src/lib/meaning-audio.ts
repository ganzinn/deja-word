import "server-only";

import { defaultBlobClient, type BlobClient } from "@/lib/blob-client";
import { prisma } from "@/lib/prisma";
import { ForbiddenUpdateError } from "@/lib/words/policy/row-policy";

export { ForbiddenUpdateError };

/** Server Action から直接叩かれるためサーバ側でも MIME / サイズを再検証する。 */
export const AUDIO_MIME = "audio/mpeg";
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 4MB（next.config.ts の bodySizeLimit 4.5mb 内）

export class InvalidAudioError extends Error {
  constructor(reason: string) {
    super(`INVALID_AUDIO: ${reason}`);
    this.name = "InvalidAudioError";
  }
}

export class MeaningNotFoundError extends Error {
  constructor() {
    super("MEANING_NOT_FOUND");
    this.name = "MeaningNotFoundError";
  }
}

type AudioSlot = "pronunciation" | "translation";

const FILENAME: Record<AudioSlot, string> = {
  pronunciation: "pronunciation.mp3",
  translation: "translation.mp3",
};

function validateAudioFile(file: File): void {
  if (file.type !== AUDIO_MIME) {
    throw new InvalidAudioError("only audio/mpeg (mp3) is allowed");
  }
  if (file.size === 0) {
    throw new InvalidAudioError("empty file");
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new InvalidAudioError("file exceeds 4MB");
  }
}

/**
 * 対象 Meaning を取得し、`ownerId === userId`（owner 本人のみ）を検査する。
 * owner 一致だけで判定するため、一般ユーザーは SYSTEM 所有 Meaning を操作できず、
 * SYSTEM 所有 Meaning は owner である SYSTEM 自身のみが操作できる。
 */
async function loadOwnedMeaning(userId: string, meaningId: string) {
  const meaning = await prisma.meaning.findUnique({
    where: { id: meaningId },
    select: {
      id: true,
      ownerId: true,
      pronunciationAudioUrl: true,
      translationAudioUrl: true,
    },
  });
  if (!meaning) throw new MeaningNotFoundError();
  if (meaning.ownerId !== userId) {
    throw new ForbiddenUpdateError(`meaning ${meaningId} not owned by user`);
  }
  return meaning;
}

function currentUrl(
  meaning: { pronunciationAudioUrl: string | null; translationAudioUrl: string | null },
  slot: AudioSlot,
): string | null {
  return slot === "pronunciation" ? meaning.pronunciationAudioUrl : meaning.translationAudioUrl;
}

async function writeUrl(meaningId: string, slot: AudioSlot, url: string | null): Promise<void> {
  await prisma.meaning.update({
    where: { id: meaningId },
    data: slot === "pronunciation" ? { pronunciationAudioUrl: url } : { translationAudioUrl: url },
    select: { id: true },
  });
}

/** del は無料・冪等。失敗してもログのみで DB 操作は通す（孤児 Blob は後追い回収可）。 */
async function bestEffortDel(blob: BlobClient, url: string | string[]): Promise<void> {
  try {
    await blob.del(url);
  } catch (e) {
    console.error("[meaning-audio] blob del failed", e);
  }
}

/**
 * 順序が重要: put → update → 旧 del。これにより DB が削除済み URL を指す状態が
 * 原理的に起きない。put 失敗時は完全無変更、update 失敗時も新 Blob が orphan として
 * 残るだけ（後追い del で回収可）。
 */
async function uploadAudio(
  userId: string,
  meaningId: string,
  slot: AudioSlot,
  file: File,
  blob: BlobClient,
): Promise<{ url: string }> {
  validateAudioFile(file);
  const meaning = await loadOwnedMeaning(userId, meaningId);
  const oldUrl = currentUrl(meaning, slot);

  const { url } = await blob.put(`audio/meaning/${meaningId}/${FILENAME[slot]}`, file);
  await writeUrl(meaningId, slot, url);
  if (oldUrl) await bestEffortDel(blob, oldUrl);

  return { url };
}

async function deleteAudio(
  userId: string,
  meaningId: string,
  slot: AudioSlot,
  blob: BlobClient,
): Promise<void> {
  const meaning = await loadOwnedMeaning(userId, meaningId);
  const oldUrl = currentUrl(meaning, slot);

  await writeUrl(meaningId, slot, null);
  if (oldUrl) await bestEffortDel(blob, oldUrl);
}

export function uploadPronunciationAudioForUser(
  userId: string,
  meaningId: string,
  file: File,
  blob: BlobClient = defaultBlobClient,
): Promise<{ url: string }> {
  return uploadAudio(userId, meaningId, "pronunciation", file, blob);
}

export function deletePronunciationAudioForUser(
  userId: string,
  meaningId: string,
  blob: BlobClient = defaultBlobClient,
): Promise<void> {
  return deleteAudio(userId, meaningId, "pronunciation", blob);
}

export function uploadTranslationAudioForUser(
  userId: string,
  meaningId: string,
  file: File,
  blob: BlobClient = defaultBlobClient,
): Promise<{ url: string }> {
  return uploadAudio(userId, meaningId, "translation", file, blob);
}

export function deleteTranslationAudioForUser(
  userId: string,
  meaningId: string,
  blob: BlobClient = defaultBlobClient,
): Promise<void> {
  return deleteAudio(userId, meaningId, "translation", blob);
}

/**
 * Word 削除 / 編集の orphan delete に伴う Blob クリーンアップ用。DB を真実とし、
 * 行削除が確定した後にベストエフォートでまとめて del する。
 */
export async function bestEffortDeleteAudioUrls(
  urls: ReadonlyArray<string | null>,
  blob: BlobClient = defaultBlobClient,
): Promise<void> {
  const valid = urls.filter((u): u is string => !!u);
  if (valid.length === 0) return;
  await bestEffortDel(blob, valid);
}
