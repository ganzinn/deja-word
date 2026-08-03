import "server-only";

import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";

/**
 * 一括プリフェッチ（docs/adr/0075-audio-local-cache-and-prefetch.md）のダウンロード単位。
 * `word` = 見出し語・関連語（Meaning + RelatedWord）、`example` = 例文（Example）。
 *
 * 例文音源は 1 件あたりの再生時間が語より長く件数の伸び方も読めないため、
 * 「見出し語だけ端末に持つ」「例文は Wi-Fi のときだけ」を選べるようグループを分けている。
 */
export type AudioGroup = "word" | "example";
export type AudioUrlGroups = Record<AudioGroup, string[]>;
export type AudioCountGroups = Record<AudioGroup, number>;

type AudioUrlRow = { pronunciationAudioUrl: string | null };

/**
 * 行の集まりから音源 URL を取り出し、重複を畳んでソートする。
 * 重複排除はグループ内で足りる（blob key の接頭辞が `audio/meaning/` / `audio/related-word/`
 * / `audio/example/` で分かれ、addRandomSuffix により URL は一意なので、グループ間で
 * 同じ URL が現れることは無い）。
 */
function collectAudioUrls(rowGroups: AudioUrlRow[][]): string[] {
  const urls = new Set<string>();
  for (const row of rowGroups.flat()) {
    if (row.pronunciationAudioUrl) urls.add(row.pronunciationAudioUrl);
  }
  return [...urls].sort();
}

/**
 * 一括プリフェッチが対象にする音源 URL を、グループ別に返す。
 *
 * 音源は Meaning（英単語）・RelatedWord（関連語）・Example（例文）の 3 箇所にあり、どれも
 * `scopedOwnerIds`（system + 本人）で引く。値は dev では相対 key（`/api/dev-blob/...`）、
 * 本番では絶対 URL なので、キャッシュキーへの正規化はクライアント側（`audio-cache.ts`）が行う。
 *
 * 呼び出し側（`/api/audio/manifest`）は常に両グループを返す。片方のグループだけで
 * キャッシュを掃除すると、もう一方が「manifest に無い」扱いで消えるため、prune の判定には
 * 両グループの和集合（`unionAudioUrlGroups`）を使うこと。
 */
export async function listAudioUrlsForUser(userId: string): Promise<AudioUrlGroups> {
  const where = {
    ownerId: { in: scopedOwnerIds(userId) },
    pronunciationAudioUrl: { not: null },
  };
  const [meanings, relatedWords, examples] = await Promise.all([
    prisma.meaning.findMany({ where, select: { pronunciationAudioUrl: true } }),
    prisma.relatedWord.findMany({ where, select: { pronunciationAudioUrl: true } }),
    prisma.example.findMany({ where, select: { pronunciationAudioUrl: true } }),
  ]);

  return {
    word: collectAudioUrls([meanings, relatedWords]),
    example: collectAudioUrls([examples]),
  };
}

/**
 * グループ別の対象件数だけを返す（設定画面の初期表示用。URL 本体をページに載せないため）。
 *
 * 音源 URL は addRandomSuffix で一意（ADR-0044）なので、行数と URL 種類数は一致する。
 * 万一重複があっても表示件数がわずかに多く出るだけで、実行時は manifest 側で重複排除される。
 */
export async function countAudioUrlsForUser(userId: string): Promise<AudioCountGroups> {
  const where = {
    ownerId: { in: scopedOwnerIds(userId) },
    pronunciationAudioUrl: { not: null },
  };
  const [meanings, relatedWords, examples] = await Promise.all([
    prisma.meaning.count({ where }),
    prisma.relatedWord.count({ where }),
    prisma.example.count({ where }),
  ]);

  return { word: meanings + relatedWords, example: examples };
}
