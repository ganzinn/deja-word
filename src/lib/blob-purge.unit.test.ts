import { describe, expect, test, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { BlobClient } from "@/lib/blob-client";
import { purgeAllAudioBlobs } from "@/lib/blob-purge";

/** Meaning / RelatedWord / Example の pronunciationAudioUrl 問い合わせだけを模した PrismaClient を作る。 */
function makePrisma(
  meaningUrls: (string | null)[],
  relatedWordUrls: (string | null)[] = [],
  exampleUrls: (string | null)[] = [],
) {
  const rows = (urls: (string | null)[]) =>
    urls.map((pronunciationAudioUrl) => ({
      pronunciationAudioUrl,
    }));
  return {
    meaning: { findMany: vi.fn(async () => rows(meaningUrls)) },
    relatedWord: { findMany: vi.fn(async () => rows(relatedWordUrls)) },
    example: { findMany: vi.fn(async () => rows(exampleUrls)) },
  } as unknown as PrismaClient;
}

function makeBlob(del: BlobClient["del"]) {
  return { put: vi.fn(), del: vi.fn(del) } satisfies BlobClient;
}

const URL_A = "https://example.public.blob.vercel-storage.com/a.mp3";
const URL_B = "https://example.public.blob.vercel-storage.com/b.mp3";
const URL_C = "https://example.public.blob.vercel-storage.com/c.mp3";

describe("purgeAllAudioBlobs", () => {
  test("dry-run は件数だけ返し、blob.del を呼ばない", async () => {
    const blob = makeBlob(async () => undefined);

    const report = await purgeAllAudioBlobs(makePrisma([URL_A], [URL_B], [URL_C]), blob, {
      dryRun: true,
    });

    expect(report).toEqual({ audioFiles: 3, executed: false });
    expect(blob.del).not.toHaveBeenCalled();
  });

  test("Meaning / RelatedWord / Example の URL を重複排除して 1 回でまとめて削除する", async () => {
    const blob = makeBlob(async () => undefined);

    const report = await purgeAllAudioBlobs(makePrisma([URL_A, URL_B], [URL_A], [URL_C]), blob, {
      dryRun: false,
    });

    expect(report).toEqual({ audioFiles: 3, executed: true });
    expect(blob.del).toHaveBeenCalledTimes(1);
    expect(blob.del).toHaveBeenCalledWith([URL_A, URL_B, URL_C]);
  });

  test("blob.del の失敗は投げずに deleteError として返す（呼び出し元が成功と区別できるように）", async () => {
    const boom = new Error("Vercel Blob: Access denied");
    const blob = makeBlob(async () => {
      throw boom;
    });

    const report = await purgeAllAudioBlobs(makePrisma([URL_A]), blob, { dryRun: false });

    expect(report).toEqual({ audioFiles: 1, executed: true, deleteError: boom });
  });

  test("削除対象が 0 件なら blob.del を呼ばず成功扱い", async () => {
    const blob = makeBlob(async () => undefined);

    const report = await purgeAllAudioBlobs(makePrisma([]), blob, { dryRun: false });

    expect(report).toEqual({ audioFiles: 0, executed: true });
    expect(blob.del).not.toHaveBeenCalled();
  });
});
