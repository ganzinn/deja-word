import { describe, expect, test } from "vitest";

import type { BlobClient } from "@/lib/blob-client";
import { OccurrenceNotFoundError, purgeOccurrence } from "@/lib/occurrence-purge";
import { prisma } from "@/lib/prisma";

import { createOccurrenceRow, createTestUser } from "../../tests/setup/fixtures";

/** del された URL を記録するインメモリ BlobClient（pronunciation-audio の test と同型）。 */
function fakeBlob() {
  const deleted = new Set<string>();
  const blob: BlobClient = {
    async put() {
      throw new Error("put not used in purge test");
    },
    async del(url) {
      for (const u of Array.isArray(url) ? url : [url]) deleted.add(u);
    },
  };
  return { blob, deleted };
}

/** 掲載箇所に紐づく、Meaning（発音音源 URL 付き）と RelatedWord を持つ Word を作る。 */
async function createLinkedWord(
  ownerId: string,
  headword: string,
  occurrenceId: string,
  audioUrl: string | null,
) {
  const word = await prisma.word.create({
    data: {
      ownerId,
      headword,
      meanings: {
        create: {
          ownerId,
          pronunciationAudioUrl: audioUrl,
          texts: { create: { ownerId, text: `${headword}の意味` } },
        },
      },
    },
    select: { id: true },
  });
  await prisma.wordOccurrence.create({
    data: { wordId: word.id, occurrenceId, ownerId },
  });
  return word;
}

describe("purgeOccurrence", () => {
  test("dry-run reports counts and changes nothing", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "dry-run-target", 0, [user.id]);
    const word = await createLinkedWord(user.id, "anchor", occ.id, "/api/dev-blob/a.mp3");
    const { blob, deleted } = fakeBlob();

    const report = await purgeOccurrence(prisma, blob, occ.id, { dryRun: true });

    expect(report.words).toBe(1);
    expect(report.meanings).toBe(1);
    expect(report.audioFiles).toBe(1);
    expect(report.presetSettings).toBe(1);
    expect(report.executed).toBe(false);
    expect(deleted.size).toBe(0);
    expect(await prisma.word.findUnique({ where: { id: word.id } })).not.toBeNull();
    expect(await prisma.occurrence.findUnique({ where: { id: occ.id } })).not.toBeNull();
  });

  test("execute deletes words, descendants, occurrence, and audio blobs", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "purge-target", 0, [user.id]);
    const word = await createLinkedWord(user.id, "ephemeral", occ.id, "/api/dev-blob/e.mp3");
    const { blob, deleted } = fakeBlob();

    const report = await purgeOccurrence(prisma, blob, occ.id, { dryRun: false });

    expect(report.executed).toBe(true);
    expect(await prisma.word.findUnique({ where: { id: word.id } })).toBeNull();
    expect(await prisma.meaning.count({ where: { wordId: word.id } })).toBe(0);
    expect(await prisma.wordOccurrence.count({ where: { occurrenceId: occ.id } })).toBe(0);
    expect(await prisma.occurrence.findUnique({ where: { id: occ.id } })).toBeNull();
    expect(deleted.has("/api/dev-blob/e.mp3")).toBe(true);
  });

  test("shared word is fully deleted and its other occurrence link disappears", async () => {
    const user = await createTestUser();
    const target = await createOccurrenceRow(user.id, "shared-target", 0);
    const other = await createOccurrenceRow(user.id, "shared-other", 1);
    const word = await createLinkedWord(user.id, "shared", target.id, null);
    // 同じ word を別掲載箇所にもリンク
    await prisma.wordOccurrence.create({
      data: { wordId: word.id, occurrenceId: other.id, ownerId: user.id },
    });
    const { blob } = fakeBlob();

    const report = await purgeOccurrence(prisma, blob, target.id, { dryRun: false });

    expect(report.sharedWords).toBe(1);
    expect(await prisma.word.findUnique({ where: { id: word.id } })).toBeNull();
    expect(await prisma.wordOccurrence.count({ where: { occurrenceId: other.id } })).toBe(0);
    // 別掲載箇所の行自体は残る
    expect(await prisma.occurrence.findUnique({ where: { id: other.id } })).not.toBeNull();
  });

  test("throws OccurrenceNotFoundError for unknown id", async () => {
    const { blob } = fakeBlob();
    await expect(
      purgeOccurrence(prisma, blob, "nonexistent", { dryRun: true }),
    ).rejects.toBeInstanceOf(OccurrenceNotFoundError);
  });
});
