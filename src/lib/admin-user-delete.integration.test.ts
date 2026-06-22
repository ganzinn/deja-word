import { describe, expect, test } from "vitest";

import type { BlobClient } from "@/lib/blob-client";
import { deleteUserForAdmin, UserNotFoundError } from "@/lib/admin-user-delete";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createOccurrenceRow, createTestUser, createWordRow } from "../../tests/setup/fixtures";

/** del 呼び出しを記録するだけのインメモリ BlobClient。 */
function recordingBlobClient(): BlobClient & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async put() {
      throw new Error("not used");
    },
    async del(url) {
      for (const u of Array.isArray(url) ? url : [url]) deleted.push(u);
    },
  };
}

describe("deleteUserForAdmin", () => {
  test("cascades all owned data and best-effort deletes pronunciation blobs", async () => {
    const user = await createTestUser();
    const word = await createWordRow(user.id, "owned");
    const meaning = await prisma.meaning.create({
      data: {
        wordId: word.id,
        ownerId: user.id,
        sortOrder: 0,
        pronunciationAudioUrl: "/api/dev-blob/audio/meaning/m1/pronunciation-abc.mp3",
      },
      select: { id: true },
    });
    await prisma.relatedWord.create({
      data: {
        wordId: word.id,
        ownerId: user.id,
        term: "rel",
        sortOrder: 0,
        pronunciationAudioUrl: "/api/dev-blob/audio/related-word/r1/pronunciation-def.mp3",
      },
    });
    const occ = await createOccurrenceRow(user.id, "user-occ", 0, [user.id]);

    const blob = recordingBlobClient();
    await deleteUserForAdmin(user.id, blob);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.word.count({ where: { ownerId: user.id } })).toBe(0);
    expect(await prisma.meaning.count({ where: { id: meaning.id } })).toBe(0);
    expect(await prisma.relatedWord.count({ where: { ownerId: user.id } })).toBe(0);
    expect(await prisma.occurrence.count({ where: { id: occ.id } })).toBe(0);

    expect(blob.deleted).toEqual(
      expect.arrayContaining([
        "/api/dev-blob/audio/meaning/m1/pronunciation-abc.mp3",
        "/api/dev-blob/audio/related-word/r1/pronunciation-def.mp3",
      ]),
    );
    expect(blob.deleted).toHaveLength(2);
  });

  test("does not touch other users' data", async () => {
    const target = await createTestUser();
    const other = await createTestUser();
    const otherWord = await createWordRow(other.id, "survivor");

    await deleteUserForAdmin(target.id, recordingBlobClient());

    expect(await prisma.user.findUnique({ where: { id: other.id } })).not.toBeNull();
    expect(await prisma.word.findUnique({ where: { id: otherWord.id } })).not.toBeNull();
  });

  test("rejects deleting the system user", async () => {
    await expect(deleteUserForAdmin(SYSTEM_USER_ID, recordingBlobClient())).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(await prisma.user.findUnique({ where: { id: SYSTEM_USER_ID } })).not.toBeNull();
  });

  test("rejects a non-existent user", async () => {
    await expect(
      deleteUserForAdmin("u_does_not_exist", recordingBlobClient()),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
