import { describe, expect, test } from "vitest";

import {
  type AudioImportRow,
  OccurrenceNotFoundError,
  importPronunciationAudio,
} from "@/lib/audio-import";
import type { BlobClient } from "@/lib/blob-client";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createOccurrenceRow, createQuizWordRow } from "../../tests/setup/fixtures";

const LOCATION = "音源テスト";

/** put した pathname と body を記録するインメモリ BlobClient（pronunciation-audio の test と同型）。 */
function fakeBlob() {
  const puts: { pathname: string; bytes: number }[] = [];
  let seq = 0;
  const blob: BlobClient = {
    async put(pathname, body) {
      seq += 1;
      puts.push({ pathname, bytes: (await body.arrayBuffer()).byteLength });
      return { url: `https://blob.test/${pathname}-${seq}` };
    },
    async del() {},
  };
  return { blob, puts };
}

function row(occurrenceNumber: number, overrides: Partial<AudioImportRow> = {}): AudioImportRow {
  return {
    occurrenceNumber,
    fileName: `${String(occurrenceNumber).padStart(4, "0")}.mp3`,
    headwordHint: null,
    readBytes: async () => new Uint8Array([1, 2, 3]),
    ...overrides,
  };
}

/** 掲載番号 1/2/3 の 3 語を持つ掲載箇所を用意する。 */
async function seedOccurrenceWithWords() {
  const occ = await createOccurrenceRow(SYSTEM_USER_ID, LOCATION, 9);
  const make = (headword: string, n: number) =>
    createQuizWordRow(SYSTEM_USER_ID, headword, {
      occurrence: { id: occ.id, occurrenceNumber: n },
    });
  const alpha = await make("alpha", 1);
  const beta = await make("beta", 2);
  const gamma = await make("gamma", 3);
  return { occ, alpha, beta, gamma };
}

async function audioUrlOf(wordId: string): Promise<string | null> {
  const meaning = await prisma.meaning.findFirst({
    where: { wordId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { pronunciationAudioUrl: true },
  });
  return meaning?.pronunciationAudioUrl ?? null;
}

describe("importPronunciationAudio", () => {
  test("掲載番号で突合して先頭 Meaning に音源を登録し、対象外を報告する", async () => {
    const { occ, alpha, beta } = await seedOccurrenceWithWords();
    const { blob, puts } = fakeBlob();

    const rows: AudioImportRow[] = [
      row(1), // 通常
      row(2, { fileName: "0002_beta.mp3", headwordHint: "beta" }), // メモ一致
      row(9, { fileName: "0009.mp3" }), // その番号の単語なし
    ];

    const report = await importPronunciationAudio(prisma, blob, { location: LOCATION }, rows, {
      dryRun: false,
    });

    expect(report.occurrenceId).toBe(occ.id);
    expect(report.totalFiles).toBe(3);
    expect(report.willUpload).toBe(2);
    expect(report.uploaded).toBe(2);
    expect(report.failures).toEqual([]);
    expect(report.mismatches).toEqual([]);
    expect(report.skipped).toEqual([
      { occurrenceNumber: 9, fileName: "0009.mp3", headword: null, reason: "word_not_found" },
    ]);
    // 掲載番号 3（gamma）は音源ファイルが無いまま残る。
    expect(report.numbersWithoutFile).toEqual([3]);

    const alphaMeaningId = (
      await prisma.meaning.findFirstOrThrow({
        where: { wordId: alpha.id },
        select: { id: true },
      })
    ).id;
    expect(puts.map((p) => p.pathname)).toContain(
      `audio/meaning/${alphaMeaningId}/pronunciation.mp3`,
    );
    expect(puts.every((p) => p.bytes === 3)).toBe(true);
    expect(await audioUrlOf(alpha.id)).toMatch(/^https:\/\/blob\.test\//);
    expect(await audioUrlOf(beta.id)).toMatch(/^https:\/\/blob\.test\//);
  });

  test("ファイル名メモが見出し語と食い違っても掲載番号を正として登録し、不一致を報告する", async () => {
    const { alpha } = await seedOccurrenceWithWords();
    const { blob } = fakeBlob();

    const report = await importPronunciationAudio(
      prisma,
      blob,
      { location: LOCATION },
      [row(1, { fileName: "0001_alfa.mp3", headwordHint: "alfa" })],
      { dryRun: false },
    );

    expect(report.uploaded).toBe(1);
    expect(report.mismatches).toEqual([
      { occurrenceNumber: 1, fileName: "0001_alfa.mp3", headwordHint: "alfa", headword: "alpha" },
    ]);
    expect(await audioUrlOf(alpha.id)).not.toBeNull();
  });

  test("登録済み・意味なし・番号重複はスキップする（再実行で続きから再開できる）", async () => {
    const { occ, alpha } = await seedOccurrenceWithWords();
    // 意味を持たない単語を掲載番号 4 に用意する。
    const noMeaning = await prisma.word.create({
      data: {
        ownerId: SYSTEM_USER_ID,
        headword: "delta",
        wordOccurrences: {
          create: { occurrenceId: occ.id, ownerId: SYSTEM_USER_ID, occurrenceNumber: 4 },
        },
      },
      select: { id: true },
    });
    const { blob } = fakeBlob();

    // 1 回目: 掲載番号 1 だけ登録する。
    await importPronunciationAudio(prisma, blob, { location: LOCATION }, [row(1)], {
      dryRun: false,
    });

    // 2 回目: 同じ 1 を含めて再実行する。
    const { blob: blob2, puts: puts2 } = fakeBlob();
    const report = await importPronunciationAudio(
      prisma,
      blob2,
      { location: LOCATION },
      [row(1), row(2), row(2, { fileName: "0002_dup.mp3" }), row(4)],
      { dryRun: false },
    );

    expect(report.uploaded).toBe(1); // 掲載番号 2 のみ
    expect(puts2).toHaveLength(1);
    expect(report.skipped).toEqual([
      {
        occurrenceNumber: 1,
        fileName: "0001.mp3",
        headword: "alpha",
        reason: "already_registered",
      },
      {
        occurrenceNumber: 2,
        fileName: "0002_dup.mp3",
        headword: "beta",
        reason: "duplicate_number",
      },
      { occurrenceNumber: 4, fileName: "0004.mp3", headword: "delta", reason: "no_meaning" },
    ]);
    expect(await audioUrlOf(noMeaning.id)).toBeNull();
    // 1 回目の URL は上書きされない。
    expect(await audioUrlOf(alpha.id)).toMatch(/-1$/);
  });

  test("dry-run は Blob も DB も変更せず、登録予定だけを返す", async () => {
    const { alpha } = await seedOccurrenceWithWords();
    const { blob, puts } = fakeBlob();

    const report = await importPronunciationAudio(
      prisma,
      blob,
      { location: LOCATION },
      [row(1), row(2)],
      { dryRun: true },
    );

    expect(report.executed).toBe(false);
    expect(report.willUpload).toBe(2);
    expect(report.uploaded).toBe(0);
    expect(puts).toEqual([]);
    expect(await audioUrlOf(alpha.id)).toBeNull();
  });

  test("1 件が失敗しても続行し、失敗を報告する（DB は成功分のみ更新）", async () => {
    const { alpha, beta } = await seedOccurrenceWithWords();
    const failing: BlobClient = {
      async put(pathname) {
        const alphaMeaning = await prisma.meaning.findFirstOrThrow({
          where: { wordId: alpha.id },
          select: { id: true },
        });
        if (pathname.includes(alphaMeaning.id)) throw new Error("network down");
        return { url: `https://blob.test/${pathname}` };
      },
      async del() {},
    };

    const report = await importPronunciationAudio(
      prisma,
      failing,
      { location: LOCATION },
      [row(1), row(2)],
      { dryRun: false },
    );

    expect(report.uploaded).toBe(1);
    expect(report.failures).toEqual([
      { occurrenceNumber: 1, fileName: "0001.mp3", headword: "alpha", message: "network down" },
    ]);
    expect(await audioUrlOf(alpha.id)).toBeNull();
    expect(await audioUrlOf(beta.id)).not.toBeNull();
  });

  test("掲載箇所が無ければ OccurrenceNotFoundError", async () => {
    const { blob } = fakeBlob();
    await expect(
      importPronunciationAudio(prisma, blob, { location: "存在しない" }, [row(1)], {
        dryRun: true,
      }),
    ).rejects.toBeInstanceOf(OccurrenceNotFoundError);
  });
});
