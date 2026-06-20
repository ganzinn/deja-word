import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { del, put } from "@vercel/blob";

/**
 * Vercel Blob の put/del だけを薄く抽象化したインターフェース。テスト時に
 * インメモリ実装を、ローカル開発時にディスク実装を注入できるようにする DI 境界。
 */
export interface BlobClient {
  put(pathname: string, body: Blob | File): Promise<{ url: string }>;
  del(url: string | string[]): Promise<void>;
}

export const vercelBlobClient: BlobClient = {
  async put(pathname, body) {
    const { url } = await put(pathname, body, {
      access: "public",
      addRandomSuffix: true,
    });
    return { url };
  },
  async del(url) {
    await del(url);
  },
};

// --- ローカルディスク driver（dev 限定） --------------------------------------

/**
 * `.dev-blob/` 配下に保存し、`/api/dev-blob/<key>` で配信する（Vercel に非依存）。
 * 既定は `<cwd>/.dev-blob` だが、git worktree で本体と DB を共有する際は `DEV_BLOB_ROOT`
 * で本体の `.dev-blob` 絶対パスを指して音源も共有する（DB の相対 key と実体のズレ防止）。
 */
export const DEV_BLOB_ROOT = process.env.DEV_BLOB_ROOT
  ? resolve(process.env.DEV_BLOB_ROOT)
  : resolve(process.cwd(), ".dev-blob");
export const DEV_BLOB_URL_PREFIX = "/api/dev-blob/";

/** addRandomSuffix 相当: 拡張子の手前にランダム文字列を挟む。 */
function withRandomSuffix(pathname: string): string {
  const dot = pathname.lastIndexOf(".");
  const suffix = randomBytes(8).toString("hex");
  if (dot <= pathname.lastIndexOf("/")) return `${pathname}-${suffix}`;
  return `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}`;
}

/** root の外を指す key を弾いて絶対パスに解決する。 */
export function resolveDevBlobPath(key: string, root: string = DEV_BLOB_ROOT): string | null {
  const full = resolve(root, key);
  if (full !== root && !full.startsWith(root + "/")) return null;
  return full;
}

/** 保存先 root を注入できるファクトリ。テストでは一時ディレクトリを渡す。 */
export function createLocalDiskBlobClient(root: string = DEV_BLOB_ROOT): BlobClient {
  return {
    async put(pathname, body) {
      const key = withRandomSuffix(pathname.replace(/^\/+/, ""));
      const full = resolveDevBlobPath(key, root);
      if (!full) throw new Error(`invalid blob pathname: ${pathname}`);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, Buffer.from(await body.arrayBuffer()));
      return { url: `${DEV_BLOB_URL_PREFIX}${key}` };
    },
    async del(url) {
      const urls = Array.isArray(url) ? url : [url];
      await Promise.all(
        urls.map(async (u) => {
          if (!u.startsWith(DEV_BLOB_URL_PREFIX)) return; // 他 driver 由来の URL は無視
          const key = decodeURIComponent(u.slice(DEV_BLOB_URL_PREFIX.length));
          const full = resolveDevBlobPath(key, root);
          if (!full) return;
          await rm(full, { force: true });
        }),
      );
    },
  };
}

export const localDiskBlobClient: BlobClient = createLocalDiskBlobClient();

// --- driver 選択（Rails の environments/*.rb での service 選択に相当） ----------

/**
 * 本番（NODE_ENV=production）は常に実 Vercel Blob。それ以外でトークン未設定なら
 * ローカルディスク（Vercel に非依存）。dev でもトークンを入れれば実 Blob を使える。
 * 本番でトークン未設定の場合はディスクに落とさず実 Blob 経路のまま明示エラーにする。
 */
function resolveDefaultBlobClient(): BlobClient {
  if (process.env.NODE_ENV !== "production" && !process.env.BLOB_READ_WRITE_TOKEN) {
    return localDiskBlobClient;
  }
  return vercelBlobClient;
}

export const defaultBlobClient: BlobClient = resolveDefaultBlobClient();
