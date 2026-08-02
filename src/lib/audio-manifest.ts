import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

/**
 * 発音音源の一括プリフェッチ（docs/design/audio-prefetch.md）が対象にする音源 URL の一覧。
 *
 * 音源は Meaning（英単語）と RelatedWord（関連語）の 2 箇所にあり、どちらも
 * `scopedOwnerIds`（system + 本人）で引く。値は dev では相対 key（`/api/dev-blob/...`）、
 * 本番では絶対 URL なので、キャッシュキーへの正規化はクライアント側（`audio-cache.ts`）が行う。
 */
export async function listAudioUrlsForUser(userId: string): Promise<string[]> {
  const where = {
    ownerId: { in: scopedOwnerIds(userId) },
    pronunciationAudioUrl: { not: null },
  };
  const [meanings, relatedWords] = await Promise.all([
    prisma.meaning.findMany({ where, select: { pronunciationAudioUrl: true } }),
    prisma.relatedWord.findMany({ where, select: { pronunciationAudioUrl: true } }),
  ]);

  const urls = new Set<string>();
  for (const row of [...meanings, ...relatedWords]) {
    if (row.pronunciationAudioUrl) urls.add(row.pronunciationAudioUrl);
  }
  return [...urls].sort();
}

/**
 * 対象件数だけを返す（設定画面の初期表示用。URL 本体をページに載せないため）。
 *
 * 音源 URL は addRandomSuffix で一意（ADR-0044）なので、行数と URL 種類数は一致する。
 * 万一重複があっても表示件数がわずかに多く出るだけで、実行時は manifest 側で重複排除される。
 */
export async function countAudioUrlsForUser(userId: string): Promise<number> {
  const where = {
    ownerId: { in: scopedOwnerIds(userId) },
    pronunciationAudioUrl: { not: null },
  };
  const [meanings, relatedWords] = await Promise.all([
    prisma.meaning.count({ where }),
    prisma.relatedWord.count({ where }),
  ]);
  return meanings + relatedWords;
}
