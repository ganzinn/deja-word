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
  deleteError?: unknown; // blob.del が投げた場合のエラー（= 1 件も消えていない）
};

/**
 * Meaning / RelatedWord に記録された発音音源 URL を全件収集し、`dryRun` でなければ
 * `blob.del` でまとめて削除する。Blob は DB の cascade では消えないため別操作。
 * 削除失敗は投げずに `deleteError` として返す（DB を真実とする方針。孤児 Blob が残る
 * だけで整合性は保たれるため、ここで処理を止める必要は無い）。ただし呼び出し元が
 * 成功と区別できないと「消えていないのに成功表示」になるため、握り潰さず報告する。
 * URL は 1 回の `blob.del` にまとめて渡すので、失敗の粒度は全件 or 0 件。
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
      return { audioFiles: audioUrls.length, executed: true, deleteError: e };
    }
  }

  return { audioFiles: audioUrls.length, executed: true };
}
