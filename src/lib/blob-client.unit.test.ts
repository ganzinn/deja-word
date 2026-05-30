import { readFile, rm } from "node:fs/promises";

import { afterEach, describe, expect, test } from "vitest";

import {
  DEV_BLOB_ROOT,
  DEV_BLOB_URL_PREFIX,
  localDiskBlobClient,
  resolveDevBlobPath,
} from "@/lib/blob-client";

function keyFromUrl(url: string): string {
  return decodeURIComponent(url.slice(DEV_BLOB_URL_PREFIX.length));
}

afterEach(async () => {
  // テストで書いた音源を掃除（.dev-blob/audio 配下のみ）。
  await rm(`${DEV_BLOB_ROOT}/audio`, { recursive: true, force: true });
});

describe("localDiskBlobClient", () => {
  test("put はディスクに書き、/api/dev-blob 配信 URL を返す（拡張子前に乱数 suffix）", async () => {
    const body = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/mpeg" });
    const { url } = await localDiskBlobClient.put("audio/meaning/m1/pronunciation.mp3", body);

    expect(url.startsWith(`${DEV_BLOB_URL_PREFIX}audio/meaning/m1/pronunciation-`)).toBe(true);
    expect(url.endsWith(".mp3")).toBe(true);

    const full = resolveDevBlobPath(keyFromUrl(url));
    expect(full).not.toBeNull();
    const written = await readFile(full!);
    expect(Array.from(written)).toEqual([1, 2, 3, 4]);
  });

  test("同じ pathname でも suffix で衝突しない", async () => {
    const mk = () => new Blob([new Uint8Array([0])], { type: "audio/mpeg" });
    const a = await localDiskBlobClient.put("audio/meaning/m1/pronunciation.mp3", mk());
    const b = await localDiskBlobClient.put("audio/meaning/m1/pronunciation.mp3", mk());
    expect(a.url).not.toBe(b.url);
  });

  test("del は当該ファイルを削除する", async () => {
    const { url } = await localDiskBlobClient.put(
      "audio/meaning/m2/translation.mp3",
      new Blob([new Uint8Array([9])], { type: "audio/mpeg" }),
    );
    const full = resolveDevBlobPath(keyFromUrl(url))!;
    await expect(readFile(full)).resolves.toBeTruthy();

    await localDiskBlobClient.del(url);
    await expect(readFile(full)).rejects.toThrow();
  });

  test("del は他 driver 由来の URL を無視する（投げない）", async () => {
    await expect(
      localDiskBlobClient.del("https://example.blob.vercel-storage.com/x.mp3"),
    ).resolves.toBeUndefined();
  });

  test("resolveDevBlobPath は .dev-blob 外への脱出を弾く", () => {
    expect(resolveDevBlobPath("../escape.mp3")).toBeNull();
    expect(resolveDevBlobPath("audio/ok.mp3")).not.toBeNull();
  });
});
