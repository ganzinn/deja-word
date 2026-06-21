// DB 上のすべての発音音源 Blob（Meaning / RelatedWord の pronunciationAudioUrl）を
// まとめて削除する運用ロジック。`prisma migrate reset` で DB を全削除する前に、
// URL がまだ読めるうちに Blob 実体を消すための前段ツール（reset は Blob を消さない）。
// tsx の運用スクリプトからも呼べるよう、prisma / blob は引数注入とし、`server-only` や
// prisma シングルトンへの実行時依存を持たない（型のみ type-only import）。

import type { PrismaClient } from "@/generated/prisma/client";
import type { BlobClient } from "@/lib/blob-client";

export type PurgeAllBlobsReport = {
  audioFiles: number; // 削除対象の発音音源 Blob 数（重複排除後）
  executed: boolean; // dryRun=false で実削除したか
};

/**
 * Meaning / RelatedWord に記録された発音音源 URL を全件収集し、`dryRun` でなければ
 * `blob.del` でまとめて削除する。Blob は DB の cascade では消えないため別操作。
 * 失敗してもログのみ（DB を真実とする方針。reset 後に孤児 Blob は残らない想定だが、
 * 削除失敗時は孤児が残るだけで整合性は保たれる）。
 */
export async function purgeAllAudioBlobs(
  prisma: PrismaClient,
  blob: BlobClient,
  opts: { dryRun: boolean },
): Promise<PurgeAllBlobsReport> {
  const [meanings, relatedWords] = await Promise.all([
    prisma.meaning.findMany({
      where: { pronunciationAudioUrl: { not: null } },
      select: { pronunciationAudioUrl: true },
    }),
    prisma.relatedWord.findMany({
      where: { pronunciationAudioUrl: { not: null } },
      select: { pronunciationAudioUrl: true },
    }),
  ]);

  const audioUrls = [
    ...new Set(
      [...meanings, ...relatedWords]
        .map((r) => r.pronunciationAudioUrl)
        .filter((u): u is string => !!u),
    ),
  ];

  if (opts.dryRun) {
    return { audioFiles: audioUrls.length, executed: false };
  }

  if (audioUrls.length > 0) {
    try {
      await blob.del(audioUrls);
    } catch (e) {
      console.error("[blob-purge] blob del failed", e);
    }
  }

  return { audioFiles: audioUrls.length, executed: true };
}
