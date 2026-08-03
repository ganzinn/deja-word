// 発音音源のローカルキャッシュ Service Worker（docs/adr/0075-audio-local-cache-and-prefetch.md）。
// 対象は発音音源のリクエストのみで、ページ・Server Action・API には一切触れない。
// 音源 URL は addRandomSuffix で不変（src/lib/blob-client-impl.ts）のため、URL を
// そのままキーにした cache-first で無効化ロジックが要らない。
//
// 静的配信物のままユニットテストするため、pure 関数群を末尾の self.__swInternals で
// 公開している（テストは src/lib/sw.unit.test.ts が本ファイルを評価して検証する）。

// src/lib/audio-cache.ts の AUDIO_CACHE_NAME と同値（一括プリフェッチが同じキャッシュへ書く）。
// このファイルは静的配信物で import を持ち込まない方針のため二重管理。変えるときは両方直す。
const AUDIO_CACHE = "audio-v1";

// 本番の音源ホスト（<store-id>.public.blob.vercel-storage.com）
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
// dev のローカルディスク配信（本番では出現しない。含めることで dev でも同一経路を検証できる）
const DEV_BLOB_PREFIX = "/api/dev-blob/";

/** 発音音源のリクエスト URL か（これ以外は respondWith せず素通しする）。 */
function isAudioRequestUrl(urlString, origin) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.hostname.endsWith(BLOB_HOST_SUFFIX)) return true;
  return url.origin === origin && url.pathname.startsWith(DEV_BLOB_PREFIX);
}

/**
 * Range ヘッダを解釈して 0 始まりの閉区間 {start, end} に解決する。
 * 単一範囲（bytes=start- / bytes=start-end / bytes=-suffix）のみ対応し、
 * 多重範囲・不正値・範囲外は null（呼び出し側が全量 200 で返す。media スタックは許容する）。
 */
function parseRangeHeader(value, size) {
  if (!value || size <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!m) return null;
  const startStr = m[1];
  const endStr = m[2];
  if (startStr === "" && endStr === "") return null;
  let start;
  let end;
  if (startStr === "") {
    // suffix 形式（末尾 N バイト）
    const suffix = Number(endStr);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === "" ? size - 1 : Math.min(Number(endStr), size - 1);
  }
  if (start >= size || start > end) return null;
  return { start, end };
}

/** キャッシュ済み全量（ArrayBuffer）から 206 Partial Content を組み立てる。 */
function buildRangeResponse(fullBody, range, contentType) {
  const sliced = fullBody.slice(range.start, range.end + 1);
  return new Response(sliced, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Length": String(sliced.byteLength),
      "Content-Range": `bytes ${range.start}-${range.end}/${fullBody.byteLength}`,
      "Accept-Ranges": "bytes",
    },
  });
}

/** 全量（ArrayBuffer）から 200 応答を組み立てる（Range 解釈不能時のフォールバック）。 */
function buildFullResponse(fullBody, contentType) {
  return new Response(fullBody, {
    status: 200,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Length": String(fullBody.byteLength),
      "Accept-Ranges": "bytes",
    },
  });
}

async function respondAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  let response = await cache.match(request.url);
  if (!response) {
    // media リクエストは no-cors モードで届くが、そのまま fetch すると opaque になり
    // Cache Storage のクォータ水増し（Chrome で 1 件 ≒ 7MB 換算）を招く。cors モードで
    // 取り直して非 opaque のまま保存する（公開 Blob は access-control-allow-origin: *）。
    try {
      response = await fetch(request.url, { mode: "cors", credentials: "omit" });
    } catch {
      // オフライン等。ネットワークエラーとして返し、<audio> の onError /
      // クイズ先読みの取得失敗無視（ADR-0047）に委ねる
      return Response.error();
    }
    if (response.status !== 200) return response;
    await cache.put(request.url, response.clone());
  }

  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) return response;

  // Range 付き（WebView / Safari の media 再生）にはキャッシュ全量から 206 を組み立てる
  const fullBody = await response.arrayBuffer();
  const contentType = response.headers.get("content-type");
  const range = parseRangeHeader(rangeHeader, fullBody.byteLength);
  if (!range) return buildFullResponse(fullBody, contentType);
  return buildRangeResponse(fullBody, range, contentType);
}

self.addEventListener("install", () => {
  // 旧 SW の待機をスキップして即時有効化する。cache-first への切り替えが再生途中に
  // 起きても、応答は同一 URL の同一バイト列なので無害
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // フォーマット変更時の移行口: 旧バージョンの音源キャッシュを削除する
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("audio-v") && name !== AUDIO_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (!isAudioRequestUrl(request.url, self.location.origin)) return;
  event.respondWith(respondAudio(request));
});

// ユニットテスト用の公開（本番でも残るが self 直下のプロパティ 1 件で無害）
self.__swInternals = {
  AUDIO_CACHE,
  isAudioRequestUrl,
  parseRangeHeader,
  buildRangeResponse,
  buildFullResponse,
};
