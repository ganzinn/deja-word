import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  type BlobClient,
  createLocalDiskBlobClient,
  DEV_BLOB_URL_PREFIX,
  resolveDevBlobPath,
} from "@/lib/blob-client";

function keyFromUrl(url: string): string {
  return decodeURIComponent(url.slice(DEV_BLOB_URL_PREFIX.length));
}

// 実 `.dev-blob/`（開発データの保存先）に触れないよう、一時ディレクトリを root に注入する。
let tmpRoot: string;
let client: BlobClient;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "dev-blob-test-"));
  client = createLocalDiskBlobClient(tmpRoot);
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("createLocalDiskBlobClient", () => {
  test("put はディスクに書き、/api/dev-blob 配信 URL を返す（拡張子前に乱数 suffix）", async () => {
    const body = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/mpeg" });
    const { url } = await client.put("audio/meaning/m1/pronunciation.mp3", body);

    expect(url.startsWith(`${DEV_BLOB_URL_PREFIX}audio/meaning/m1/pronunciation-`)).toBe(true);
    expect(url.endsWith(".mp3")).toBe(true);

    const full = resolveDevBlobPath(keyFromUrl(url), tmpRoot);
    expect(full).not.toBeNull();
    const written = await readFile(full!);
    expect(Array.from(written)).toEqual([1, 2, 3, 4]);
  });

  test("同じ pathname でも suffix で衝突しない", async () => {
    const mk = () => new Blob([new Uint8Array([0])], { type: "audio/mpeg" });
    const a = await client.put("audio/meaning/m1/pronunciation.mp3", mk());
    const b = await client.put("audio/meaning/m1/pronunciation.mp3", mk());
    expect(a.url).not.toBe(b.url);
  });

  test("del は当該ファイルを削除する", async () => {
    const { url } = await client.put(
      "audio/meaning/m2/translation.mp3",
      new Blob([new Uint8Array([9])], { type: "audio/mpeg" }),
    );
    const full = resolveDevBlobPath(keyFromUrl(url), tmpRoot)!;
    await expect(readFile(full)).resolves.toBeTruthy();

    await client.del(url);
    await expect(readFile(full)).rejects.toThrow();
  });

  test("del は他 driver 由来の URL を無視する（投げない）", async () => {
    await expect(
      client.del("https://example.blob.vercel-storage.com/x.mp3"),
    ).resolves.toBeUndefined();
  });

  test("resolveDevBlobPath は root 外への脱出を弾く", () => {
    expect(resolveDevBlobPath("../escape.mp3", tmpRoot)).toBeNull();
    expect(resolveDevBlobPath("audio/ok.mp3", tmpRoot)).not.toBeNull();
  });
});
