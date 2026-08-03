// 運用スクリプトの事故防止ガード: 「リモート（本番）DB に向けているのに Blob は dev の
// ローカルディスク driver」という組み合わせを検出する。
//
// blob-client-impl の driver 選択は「NODE_ENV=production もしくは BLOB_READ_WRITE_TOKEN あり →
// Vercel Blob、それ以外 → ローカルディスク」。DB 接続先と Blob driver は別々に決まるため、
// 本番 env を読み込んでも BLOB_READ_WRITE_TOKEN だけ欠けていると（`vercel env pull` は
// sensitive な値を空で返すことがある）、**DB は本番・Blob はローカル**という組み合わせが
// 黙って成立する。この状態で音源を書くと、本番 DB に dev 専用 URL（/api/dev-blob/…、本番では
// 404）が入り、再生できないうえ TTS フォールバックも効かない行が量産される。
//
// tsx から呼べるよう `server-only` や `@/` の実行時 import を持たない（ops コア規約）。

import { localDiskBlobClient } from "./blob-client-impl";

import type { BlobClient } from "@/lib/blob-client";

export class BlobDriverMismatchError extends Error {
  constructor(public readonly databaseHost: string) {
    super(`BLOB_DRIVER_MISMATCH: ${databaseHost}`);
    this.name = "BlobDriverMismatchError";
  }
}

/** ローカル開発用 DB（docker / 手元の Postgres）か。判定できない接続文字列はリモート扱い。 */
export function isLocalDatabaseUrl(connectionString: string): boolean {
  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return false;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
}

/** dev のローカルディスク driver が選ばれているか（Vercel Blob なら false）。 */
export function isLocalDiskBlob(blob: BlobClient): boolean {
  return blob === localDiskBlobClient;
}

/**
 * リモート DB × ローカルディスク Blob の組み合わせなら `BlobDriverMismatchError` を投げる。
 * Blob へ書き込む運用スクリプトが、実書き込みの直前に呼ぶ。
 */
export function assertBlobDriverMatchesDatabase(connectionString: string, blob: BlobClient): void {
  if (isLocalDatabaseUrl(connectionString)) return;
  if (!isLocalDiskBlob(blob)) return;
  const host = (() => {
    try {
      return new URL(connectionString).hostname;
    } catch {
      return "(unparsable)";
    }
  })();
  throw new BlobDriverMismatchError(host);
}
