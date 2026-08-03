import { describe, expect, test } from "vitest";

import type { BlobClient } from "@/lib/blob-client";
import { OccurrenceNotFoundError, listOccurrences, purgeOccurrence } from "@/lib/occurrence-purge";
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

/** 掲載箇所に紐づく、Meaning と Example（いずれも発音音源 URL 付き）を持つ Word を作る。 */
async function createLinkedWord(
  ownerId: string,
  headword: string,
  occurrenceId: string,
  audioUrl: string | null,
  exampleAudioUrl: string | null = null,
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
      examples: {
        create: {
          ownerId,
          kind: "SENTENCE",
          text: `${headword} in a sentence.`,
          pronunciationAudioUrl: exampleAudioUrl,
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
    const word = await createLinkedWord(
      user.id,
      "anchor",
      occ.id,
      "/api/dev-blob/a.mp3",
      "/api/dev-blob/a-ex.mp3",
    );
    const { blob, deleted } = fakeBlob();

    const report = await purgeOccurrence(prisma, blob, occ.id, { dryRun: true });

    expect(report.words).toBe(1);
    expect(report.meanings).toBe(1);
    expect(report.examples).toBe(1);
    // Meaning + Example の 2 件が削除対象。
    expect(report.audioFiles).toBe(2);
    expect(report.presetSettings).toBe(1);
    expect(report.executed).toBe(false);
    expect(deleted.size).toBe(0);
    expect(await prisma.word.findUnique({ where: { id: word.id } })).not.toBeNull();
    expect(await prisma.occurrence.findUnique({ where: { id: occ.id } })).not.toBeNull();
  });

  test("execute deletes words, descendants, occurrence, and audio blobs", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "purge-target", 0, [user.id]);
    const word = await createLinkedWord(
      user.id,
      "ephemeral",
      occ.id,
      "/api/dev-blob/e.mp3",
      "/api/dev-blob/e-ex.mp3",
    );
    const { blob, deleted } = fakeBlob();

    const report = await purgeOccurrence(prisma, blob, occ.id, { dryRun: false });

    expect(report.executed).toBe(true);
    expect(await prisma.word.findUnique({ where: { id: word.id } })).toBeNull();
    expect(await prisma.meaning.count({ where: { wordId: word.id } })).toBe(0);
    expect(await prisma.example.count({ where: { wordId: word.id } })).toBe(0);
    expect(await prisma.wordOccurrence.count({ where: { occurrenceId: occ.id } })).toBe(0);
    expect(await prisma.occurrence.findUnique({ where: { id: occ.id } })).toBeNull();
    expect(deleted.has("/api/dev-blob/e.mp3")).toBe(true);
    expect(deleted.has("/api/dev-blob/e-ex.mp3")).toBe(true);
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

describe("listOccurrences", () => {
  test("lists occurrences with owner email and linked-word count", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "list-target", 0);
    await createLinkedWord(user.id, "alpha", occ.id, null);
    await createLinkedWord(user.id, "beta", occ.id, null);

    const items = await listOccurrences(prisma);
    const mine = items.find((it) => it.id === occ.id);

    expect(mine).toBeDefined();
    expect(mine?.location).toBe("list-target");
    expect(mine?.ownerEmail).toBe(user.email);
    expect(mine?.words).toBe(2);
  });
});
