// 発音音源のローカルキャッシュ（Cache Storage）をページ側から操作するユーティリティ。
// 一括プリフェッチ（docs/adr/0075-audio-local-cache-and-prefetch.md）で使う。
//
// Service Worker（public/sw.js）と window は同一オリジンの同じキャッシュを共有するため、
// SW に代行させず（postMessage を使わず）ページから直接読み書きする。SW が未制御の状態でも
// 同じ結果になる。server-only は付けない（client component から import する）。

import type { AudioUrlGroups } from "@/lib/audio-manifest";

/**
 * public/sw.js の `AUDIO_CACHE` と同じ値。sw.js は静的配信物でありビルド工程を持ち込まない
 * 方針（docs/adr/0075-audio-local-cache-and-prefetch.md）のため import で共有できず、二重管理になっている。
 * 変更するときは public/sw.js 側も必ず合わせること。
 */
export const AUDIO_CACHE_NAME = "audio-v1";

/** 同時ダウンロード数。1 件が数十 KB のため、これ以上増やしても転送は詰まりやすいだけ。 */
export const DEFAULT_PREFETCH_CONCURRENCY = 6;

/** Cache Storage が使える環境か（未対応ブラウザ・SSR では偽）。 */
export function isAudioCacheSupported(): boolean {
  return typeof caches !== "undefined";
}

/**
 * DB の音源 URL をキャッシュキーの形（絶対 URL）に揃える。
 * dev のローカルディスク配信は相対 key（`/api/dev-blob/...`）で保存されているが、
 * SW / Cache Storage のキーは常に絶対 URL（`request.url`）のため、突き合わせ前に正規化する。
 */
export function toAbsoluteAudioUrl(url: string, base?: string): string {
  return new URL(url, base ?? window.location.href).href;
}

export type AudioCacheDiff = {
  /** manifest にあってキャッシュに無い = これから取得する URL。 */
  missing: string[];
  /** キャッシュにあって manifest に無い = 削除・差し替え済みで不要になった URL。 */
  stale: string[];
};

/**
 * manifest（絶対 URL）とキャッシュ済み URL を突き合わせる。
 *
 * 音源 URL は addRandomSuffix で不変（ADR-0044）なので「キャッシュにある = 取得済み」と
 * 判断してよく、これだけで再ダウンロードの回避と中断・再開が成立する（進捗の永続化は不要）。
 */
export function diffAudioCache(manifestUrls: string[], cachedUrls: string[]): AudioCacheDiff {
  const manifest = new Set(manifestUrls);
  const cached = new Set(cachedUrls);
  return {
    missing: [...manifest].filter((url) => !cached.has(url)),
    stale: [...cached].filter((url) => !manifest.has(url)),
  };
}

/**
 * グループ別 URL を 1 本に畳んだ和集合（掃除の判定用）。
 *
 * manifest はグループ別（見出し語・関連語 / 例文）だが、Cache Storage は 1 つのままなので、
 * `diffAudioCache` の `stale` を求めるときは必ずこの和集合を渡す。選んだグループの URL だけで
 * 判定すると、もう一方のグループのキャッシュが「manifest に無い」扱いになって消える。
 */
export function unionAudioUrlGroups(groups: AudioUrlGroups): string[] {
  return [...new Set(Object.values(groups).flat())];
}

/** 端末のキャッシュに入っている音源 URL（絶対 URL）。未対応環境では空配列。 */
export async function listCachedAudioUrls(): Promise<string[]> {
  if (!isAudioCacheSupported()) return [];
  const cache = await caches.open(AUDIO_CACHE_NAME);
  const keys = await cache.keys();
  return keys.map((request) => request.url);
}

/** 不要になったエントリを削除し、実際に消えた件数を返す。 */
export async function pruneAudioCache(staleUrls: string[]): Promise<number> {
  if (staleUrls.length === 0 || !isAudioCacheSupported()) return 0;
  const cache = await caches.open(AUDIO_CACHE_NAME);
  const deleted = await Promise.all(staleUrls.map((url) => cache.delete(url)));
  return deleted.filter(Boolean).length;
}

/** 音源キャッシュを丸ごと捨てる（端末の容量を戻す操作）。再生時に再取得され自己修復する。 */
export async function clearAudioCache(): Promise<void> {
  if (!isAudioCacheSupported()) return;
  await caches.delete(AUDIO_CACHE_NAME);
}

export type PrefetchProgress = {
  /** 取得できた件数。 */
  done: number;
  /** 対象件数（= missing の件数）。 */
  total: number;
  /** 取得に失敗した件数（個別の失敗は全体を止めない）。 */
  failed: number;
  /** 実際にダウンロードしたバイト数。 */
  bytes: number;
};

export type PrefetchResult = PrefetchProgress & {
  /** 中止ボタン（AbortSignal）で打ち切られたか。 */
  aborted: boolean;
  /** 端末の保存容量が尽きて打ち切られたか。 */
  quotaExceeded: boolean;
};

export type PrefetchOptions = {
  /** 取得対象の絶対 URL（`diffAudioCache` の missing）。 */
  urls: string[];
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: PrefetchProgress) => void;
};

function isQuotaExceeded(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
}

/**
 * 未取得の音源を並列でダウンロードし、Cache Storage に格納する。
 *
 * - 個別の失敗（オフライン・404 等）は `failed` に数えて続行する
 * - SW 制御下では同じ fetch を SW が横取りして自ら put するため、put 前に match を見て二重書きを避ける
 * - 中止・容量超過は途中経過を返す（入りきった分はそのまま残り、次回は残りだけを取りに行く）
 */
export async function prefetchAudioUrls({
  urls,
  concurrency = DEFAULT_PREFETCH_CONCURRENCY,
  signal,
  onProgress,
}: PrefetchOptions): Promise<PrefetchResult> {
  const result: PrefetchResult = {
    done: 0,
    total: urls.length,
    failed: 0,
    bytes: 0,
    aborted: false,
    quotaExceeded: false,
  };
  if (urls.length === 0 || !isAudioCacheSupported()) return result;

  const cache = await caches.open(AUDIO_CACHE_NAME);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < urls.length) {
      if (signal?.aborted) {
        result.aborted = true;
        return;
      }
      if (result.quotaExceeded) return;

      const url = urls[next++];
      try {
        const response = await fetch(url, { mode: "cors", credentials: "omit", signal });
        if (response.status !== 200) {
          result.failed++;
        } else {
          // SW が先に put 済みなら書き直さない
          const cached = await cache.match(url);
          if (!cached) await cache.put(url, response.clone());
          // await を挟んでから加算する（`x += await ...` は読み取りが先に起きるため、
          // 並列ワーカーで加算を取りこぼす）
          const size = (await response.arrayBuffer()).byteLength;
          result.bytes += size;
          result.done++;
        }
      } catch (error) {
        if (signal?.aborted) {
          result.aborted = true;
          return;
        }
        if (isQuotaExceeded(error)) {
          result.quotaExceeded = true;
          return;
        }
        result.failed++;
      }
      onProgress?.({ ...result });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));
  return result;
}
