import { describe, expect, test } from "vitest";

import { localDiskBlobClient, vercelBlobClient } from "@/lib/blob-client";
import {
  BlobDriverMismatchError,
  assertBlobDriverMatchesDatabase,
  isLocalDatabaseUrl,
} from "@/lib/blob-driver-guard";

const LOCAL_DB = "postgresql://dejaword:dejaword@localhost:5432/dejaword?schema=public";
const REMOTE_DB = "postgresql://neondb_owner:pw@ep-xxx.ap-southeast-1.aws.neon.tech/neondb";

describe("isLocalDatabaseUrl", () => {
  test.each([
    [LOCAL_DB, true],
    ["postgresql://u:p@127.0.0.1:5432/db", true],
    [REMOTE_DB, false],
    ["postgresql://u:p@db.internal:5432/db", false],
    ["not a url", false], // 判定できないものはリモート扱い（安全側）
  ])("%s -> %s", (url, expected) => {
    expect(isLocalDatabaseUrl(url)).toBe(expected);
  });
});

describe("assertBlobDriverMatchesDatabase", () => {
  test("リモート DB × ローカルディスク driver は中止する（本番 DB に dev URL を書く事故）", () => {
    expect(() => assertBlobDriverMatchesDatabase(REMOTE_DB, localDiskBlobClient)).toThrow(
      BlobDriverMismatchError,
    );
  });

  test("リモート DB × Vercel Blob は通す", () => {
    expect(() => assertBlobDriverMatchesDatabase(REMOTE_DB, vercelBlobClient)).not.toThrow();
  });

  test("ローカル DB × ローカルディスク driver は通す（通常の dev）", () => {
    expect(() => assertBlobDriverMatchesDatabase(LOCAL_DB, localDiskBlobClient)).not.toThrow();
  });

  test("ローカル DB × Vercel Blob は通す（dev でトークンを入れた場合）", () => {
    expect(() => assertBlobDriverMatchesDatabase(LOCAL_DB, vercelBlobClient)).not.toThrow();
  });
});
