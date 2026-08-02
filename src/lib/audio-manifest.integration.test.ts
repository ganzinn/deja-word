import { describe, expect, test } from "vitest";

import { countAudioUrlsForUser, listAudioUrlsForUser } from "@/lib/audio-manifest";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createTestUser, createWordRow } from "../../tests/setup/fixtures";

/** 指定オーナーの単語に、音源付き（または未登録）の意味を 1 件足す。 */
async function createMeaningWithAudio(ownerId: string, wordId: string, audioUrl: string | null) {
  await prisma.meaning.create({
    data: { wordId, ownerId, pronunciationAudioUrl: audioUrl },
  });
}

/** 指定オーナーの単語に、音源付きの関連語を 1 件足す。 */
async function createRelatedWordWithAudio(ownerId: string, wordId: string, audioUrl: string) {
  await prisma.relatedWord.create({
    data: { wordId, ownerId, term: "synonym", pronunciationAudioUrl: audioUrl },
  });
}

describe("listAudioUrlsForUser", () => {
  test("system と本人の音源を返し、他ユーザーの音源は返さない", async () => {
    const user = await createTestUser();
    const other = await createTestUser();

    const systemWord = await createWordRow(SYSTEM_USER_ID, "system-word");
    const ownWord = await createWordRow(user.id, "own-word");
    const otherWord = await createWordRow(other.id, "other-word");
    await createMeaningWithAudio(SYSTEM_USER_ID, systemWord.id, "/api/dev-blob/audio/system.mp3");
    await createMeaningWithAudio(user.id, ownWord.id, "/api/dev-blob/audio/own.mp3");
    await createMeaningWithAudio(other.id, otherWord.id, "/api/dev-blob/audio/other.mp3");

    expect(await listAudioUrlsForUser(user.id)).toEqual([
      "/api/dev-blob/audio/own.mp3",
      "/api/dev-blob/audio/system.mp3",
    ]);
  });

  test("system 単語に足した本人の意味（pass-through 編集）の音源も含む", async () => {
    const user = await createTestUser();
    const systemWord = await createWordRow(SYSTEM_USER_ID, "system-word");
    await createMeaningWithAudio(user.id, systemWord.id, "/api/dev-blob/audio/mine-on-system.mp3");

    expect(await listAudioUrlsForUser(user.id)).toEqual(["/api/dev-blob/audio/mine-on-system.mp3"]);
  });

  test("関連語の音源も対象になる", async () => {
    const user = await createTestUser();
    const word = await createWordRow(user.id, "word");
    await createMeaningWithAudio(user.id, word.id, "/api/dev-blob/audio/meaning.mp3");
    await createRelatedWordWithAudio(user.id, word.id, "/api/dev-blob/audio/related.mp3");

    expect(await listAudioUrlsForUser(user.id)).toEqual([
      "/api/dev-blob/audio/meaning.mp3",
      "/api/dev-blob/audio/related.mp3",
    ]);
  });

  test("音源未登録（null）は除外する", async () => {
    const user = await createTestUser();
    const word = await createWordRow(user.id, "word");
    await createMeaningWithAudio(user.id, word.id, null);
    await createMeaningWithAudio(user.id, word.id, "/api/dev-blob/audio/only.mp3");

    expect(await listAudioUrlsForUser(user.id)).toEqual(["/api/dev-blob/audio/only.mp3"]);
  });

  test("同じ URL が複数行にあっても 1 件に畳む", async () => {
    const user = await createTestUser();
    const word = await createWordRow(user.id, "word");
    await createMeaningWithAudio(user.id, word.id, "/api/dev-blob/audio/dup.mp3");
    await createRelatedWordWithAudio(user.id, word.id, "/api/dev-blob/audio/dup.mp3");

    expect(await listAudioUrlsForUser(user.id)).toEqual(["/api/dev-blob/audio/dup.mp3"]);
  });

  test("音源が 1 件も無ければ空配列", async () => {
    const user = await createTestUser();
    expect(await listAudioUrlsForUser(user.id)).toEqual([]);
  });
});

describe("countAudioUrlsForUser", () => {
  test("一覧と同じスコープの件数を返す", async () => {
    const user = await createTestUser();
    const other = await createTestUser();

    const systemWord = await createWordRow(SYSTEM_USER_ID, "system-word");
    const ownWord = await createWordRow(user.id, "own-word");
    const otherWord = await createWordRow(other.id, "other-word");
    await createMeaningWithAudio(SYSTEM_USER_ID, systemWord.id, "/api/dev-blob/audio/system.mp3");
    await createMeaningWithAudio(user.id, ownWord.id, "/api/dev-blob/audio/own.mp3");
    await createMeaningWithAudio(user.id, ownWord.id, null);
    await createRelatedWordWithAudio(user.id, ownWord.id, "/api/dev-blob/audio/related.mp3");
    await createMeaningWithAudio(other.id, otherWord.id, "/api/dev-blob/audio/other.mp3");

    expect(await countAudioUrlsForUser(user.id)).toBe(3);
    expect(await countAudioUrlsForUser(user.id)).toBe((await listAudioUrlsForUser(user.id)).length);
  });
});
