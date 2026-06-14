"use server";

import {
  InvalidAudioError,
  MeaningNotFoundError,
  RelatedWordNotFoundError,
  deletePronunciationAudioForUser,
  deleteRelatedWordAudioForUser,
  uploadPronunciationAudioForUser,
  uploadRelatedWordAudioForUser,
} from "@/lib/pronunciation-audio";
import { wordFormSchema, type WordFormValues } from "@/lib/schema/word-form";
import { getCurrentSession } from "@/lib/session";
import { ForbiddenUpdateError, updateWordForUser } from "@/lib/words-update";
import { mapWordWriteErrorToResult, type WordWriteErrorCode } from "@/lib/words/error-map";

export type UpdateWordError = "unauthorized" | "invalid" | WordWriteErrorCode;

export type UpdateWordResult =
  | { ok: true; wordId: string }
  | { ok: false; error: UpdateWordError; message: string };

export async function updateWord(wordId: string, input: WordFormValues): Promise<UpdateWordResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }

  const parsed = wordFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid", message: "入力内容を確認してください。" };
  }

  try {
    const word = await updateWordForUser(session.user.id, wordId, parsed.data);
    return { ok: true, wordId: word.id };
  } catch (e) {
    return mapWordWriteErrorToResult(e);
  }
}

export type AudioActionError = "unauthorized" | "invalid" | "forbidden" | "not_found" | "unknown";

export type UploadAudioResult =
  | { ok: true; url: string }
  | { ok: false; error: AudioActionError; message: string };

export type DeleteAudioResult =
  | { ok: true }
  | { ok: false; error: AudioActionError; message: string };

function mapAudioError(e: unknown): { error: AudioActionError; message: string } {
  if (e instanceof InvalidAudioError) {
    return { error: "invalid", message: "mp3（音声）ファイルを 4MB 以下で選択してください。" };
  }
  if (e instanceof ForbiddenUpdateError) {
    return { error: "forbidden", message: "音源を操作する権限がありません。" };
  }
  if (e instanceof MeaningNotFoundError || e instanceof RelatedWordNotFoundError) {
    return { error: "not_found", message: "対象が見つかりません。" };
  }
  console.error("[pronunciation-audio] action failed", e);
  return {
    error: "unknown",
    message: "処理に失敗しました。しばらくしてから再度お試しください。",
  };
}

async function runUpload(
  meaningId: string,
  fd: FormData,
  fn: (userId: string, meaningId: string, file: File) => Promise<{ url: string }>,
): Promise<UploadAudioResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "invalid", message: "音声ファイルを選択してください。" };
  }
  try {
    const { url } = await fn(session.user.id, meaningId, file);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, ...mapAudioError(e) };
  }
}

async function runDelete(
  meaningId: string,
  fn: (userId: string, meaningId: string) => Promise<void>,
): Promise<DeleteAudioResult> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      error: "unauthorized",
      message: "ログインが必要です。再度ログインしてください。",
    };
  }
  try {
    await fn(session.user.id, meaningId);
    return { ok: true };
  } catch (e) {
    return { ok: false, ...mapAudioError(e) };
  }
}

export async function uploadPronunciationAudio(
  meaningId: string,
  fd: FormData,
): Promise<UploadAudioResult> {
  return runUpload(meaningId, fd, uploadPronunciationAudioForUser);
}

export async function deletePronunciationAudio(meaningId: string): Promise<DeleteAudioResult> {
  return runDelete(meaningId, deletePronunciationAudioForUser);
}

export async function uploadRelatedWordAudio(
  relatedWordId: string,
  fd: FormData,
): Promise<UploadAudioResult> {
  return runUpload(relatedWordId, fd, uploadRelatedWordAudioForUser);
}

export async function deleteRelatedWordAudio(relatedWordId: string): Promise<DeleteAudioResult> {
  return runDelete(relatedWordId, deleteRelatedWordAudioForUser);
}
