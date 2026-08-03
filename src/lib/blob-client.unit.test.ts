import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { del, put } from "@vercel/blob";

import {
  type BlobClient,
  createLocalDiskBlobClient,
  DEV_BLOB_URL_PREFIX,
  resolveDevBlobPath,
  vercelBlobClient,
} from "@/lib/blob-client";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async () => ({ url: "https://example.public.blob.vercel-storage.com/x.mp3" })),
  del: vi.fn(async () => undefined),
}));

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

// `@vercel/blob` の資格情報解決は options.token > env の VERCEL_OIDC_TOKEN > env の
// BLOB_READ_WRITE_TOKEN の順。`vercel env pull` が書き出す development スコープの OIDC
// トークンに rw トークンが負けないよう、常に options.token に載せていることを固定する。
describe("vercelBlobClient", () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
  const BLOB_URL = "https://example.public.blob.vercel-storage.com/x.mp3";

  afterEach(() => {
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    vi.mocked(put).mockClear();
    vi.mocked(del).mockClear();
  });

  test("put / del は rw トークンを明示的に渡す", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";

    await vercelBlobClient.put("audio/x.mp3", new Blob([new Uint8Array([1])]));
    expect(vi.mocked(put).mock.calls[0]?.[2]).toMatchObject({ token: "vercel_blob_rw_test" });

    await vercelBlobClient.del(BLOB_URL);
    expect(vi.mocked(del).mock.calls[0]).toEqual([BLOB_URL, { token: "vercel_blob_rw_test" }]);
  });

  test("トークンが空 / 未設定なら undefined を渡し、env 解決（Vercel 上の OIDC）に委ねる", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "";
    await vercelBlobClient.del(BLOB_URL);
    expect(vi.mocked(del).mock.calls[0]).toEqual([BLOB_URL, { token: undefined }]);

    delete process.env.BLOB_READ_WRITE_TOKEN;
    await vercelBlobClient.del(BLOB_URL);
    expect(vi.mocked(del).mock.calls[1]).toEqual([BLOB_URL, { token: undefined }]);
  });
});
