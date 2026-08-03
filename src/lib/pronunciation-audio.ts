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

export class RelatedWordNotFoundError extends Error {
  constructor() {
    super("RELATED_WORD_NOT_FOUND");
    this.name = "RelatedWordNotFoundError";
  }
}

export class ExampleNotFoundError extends Error {
  constructor() {
    super("EXAMPLE_NOT_FOUND");
    this.name = "ExampleNotFoundError";
  }
}

const PRONUNCIATION_FILENAME = "pronunciation.mp3";

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

/** del は無料・冪等。失敗してもログのみで DB 操作は通す（孤児 Blob は後追い回収可）。 */
async function bestEffortDel(blob: BlobClient, url: string | string[]): Promise<void> {
  try {
    await blob.del(url);
  } catch (e) {
    console.error("[pronunciation-audio] blob del failed", e);
  }
}

/**
 * 「発音音源（mp3）の Blob 管理」という単一の関心を、保持先 entity ごとの差分だけ
 * 差し込んで共有するためのディスクリプタ。meaning / related-word / example の違いは
 * 「どの行を読むか / どこに URL を書くか / Blob パス接頭辞 / NotFound エラー型」だけ。
 */
type AudioTarget = {
  dir: string;
  loadOwned: (
    id: string,
  ) => Promise<{ ownerId: string; pronunciationAudioUrl: string | null } | null>;
  writeUrl: (id: string, url: string | null) => Promise<void>;
  notFound: () => Error;
};

/**
 * 対象行を取得し、`ownerId === userId`（owner 本人のみ）を検査する。
 * owner 一致だけで判定するため、一般ユーザーは SYSTEM 所有行を操作できず、
 * SYSTEM 所有行は owner である SYSTEM 自身のみが操作できる。
 */
async function loadOwnedRow(target: AudioTarget, userId: string, id: string) {
  const row = await target.loadOwned(id);
  if (!row) throw target.notFound();
  if (row.ownerId !== userId) {
    throw new ForbiddenUpdateError(`${target.dir} ${id} not owned by user`);
  }
  return row;
}

/**
 * 順序が重要: put → update → 旧 del。これにより DB が削除済み URL を指す状態が
 * 原理的に起きない。put 失敗時は完全無変更、update 失敗時も新 Blob が orphan として
 * 残るだけ（後追い del で回収可）。
 */
async function uploadAudio(
  target: AudioTarget,
  userId: string,
  id: string,
  file: File,
  blob: BlobClient,
): Promise<{ url: string }> {
  validateAudioFile(file);
  const row = await loadOwnedRow(target, userId, id);
  const oldUrl = row.pronunciationAudioUrl;

  const { url } = await blob.put(`audio/${target.dir}/${id}/${PRONUNCIATION_FILENAME}`, file);
  await target.writeUrl(id, url);
  if (oldUrl) await bestEffortDel(blob, oldUrl);

  return { url };
}

async function deleteAudio(
  target: AudioTarget,
  userId: string,
  id: string,
  blob: BlobClient,
): Promise<void> {
  const row = await loadOwnedRow(target, userId, id);
  const oldUrl = row.pronunciationAudioUrl;

  await target.writeUrl(id, null);
  if (oldUrl) await bestEffortDel(blob, oldUrl);
}

const meaningTarget: AudioTarget = {
  dir: "meaning",
  loadOwned: (id) =>
    prisma.meaning.findUnique({
      where: { id },
      select: { ownerId: true, pronunciationAudioUrl: true },
    }),
  writeUrl: async (id, url) => {
    await prisma.meaning.update({
      where: { id },
      data: { pronunciationAudioUrl: url },
      select: { id: true },
    });
  },
  notFound: () => new MeaningNotFoundError(),
};

const relatedWordTarget: AudioTarget = {
  dir: "related-word",
  loadOwned: (id) =>
    prisma.relatedWord.findUnique({
      where: { id },
      select: { ownerId: true, pronunciationAudioUrl: true },
    }),
  writeUrl: async (id, url) => {
    await prisma.relatedWord.update({
      where: { id },
      data: { pronunciationAudioUrl: url },
      select: { id: true },
    });
  },
  notFound: () => new RelatedWordNotFoundError(),
};

// 例文種別（kind）は編集フォームで変更できるため Blob パスに含めない。
const exampleTarget: AudioTarget = {
  dir: "example",
  loadOwned: (id) =>
    prisma.example.findUnique({
      where: { id },
      select: { ownerId: true, pronunciationAudioUrl: true },
    }),
  writeUrl: async (id, url) => {
    await prisma.example.update({
      where: { id },
      data: { pronunciationAudioUrl: url },
      select: { id: true },
    });
  },
  notFound: () => new ExampleNotFoundError(),
};

export function uploadPronunciationAudioForUser(
  userId: string,
  meaningId: string,
  file: File,
  blob: BlobClient = defaultBlobClient,
): Promise<{ url: string }> {
  return uploadAudio(meaningTarget, userId, meaningId, file, blob);
}

export function deletePronunciationAudioForUser(
  userId: string,
  meaningId: string,
  blob: BlobClient = defaultBlobClient,
): Promise<void> {
  return deleteAudio(meaningTarget, userId, meaningId, blob);
}

export function uploadRelatedWordAudioForUser(
  userId: string,
  relatedWordId: string,
  file: File,
  blob: BlobClient = defaultBlobClient,
): Promise<{ url: string }> {
  return uploadAudio(relatedWordTarget, userId, relatedWordId, file, blob);
}

export function deleteRelatedWordAudioForUser(
  userId: string,
  relatedWordId: string,
  blob: BlobClient = defaultBlobClient,
): Promise<void> {
  return deleteAudio(relatedWordTarget, userId, relatedWordId, blob);
}

export function uploadExampleAudioForUser(
  userId: string,
  exampleId: string,
  file: File,
  blob: BlobClient = defaultBlobClient,
): Promise<{ url: string }> {
  return uploadAudio(exampleTarget, userId, exampleId, file, blob);
}

export function deleteExampleAudioForUser(
  userId: string,
  exampleId: string,
  blob: BlobClient = defaultBlobClient,
): Promise<void> {
  return deleteAudio(exampleTarget, userId, exampleId, blob);
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
