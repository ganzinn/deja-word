// 本番 DB を「データのみ全消去」するための運用ロジック。public スキーマの全テーブルを
// 動的に取得し、`_prisma_migrations`（マイグレーション履歴）を除いて
// `TRUNCATE ... RESTART IDENTITY CASCADE` する。スキーマ・マイグレーション履歴は保持される。
//
// 発音音源 Blob は別操作（`blob-purge.ts`）。TRUNCATE すると URL が消えるため、Blob 削除は
// 必ずこの操作より前に行うこと。再 seed（system ユーザー）も別操作（`prisma/seed.ts`）。
//
// tsx の運用スクリプトからも呼べるよう、prisma は引数注入とし、`server-only` や prisma
// シングルトンへの実行時依存を持たない（型のみ type-only import）。

import type { PrismaClient } from "@/generated/prisma/client";

export type ResetDbReport = {
  tables: string[]; // TRUNCATE 対象テーブル名（_prisma_migrations を除く）
  executed: boolean; // dryRun=false で実 TRUNCATE したか
};

/**
 * public スキーマの全テーブル（`_prisma_migrations` を除く）を取得し、`dryRun` でなければ
 * 一括で `TRUNCATE ... RESTART IDENTITY CASCADE` する。対象テーブルが 0 件なら何もしない。
 * テーブル名はハードコードせず動的取得し、将来のテーブル追加に追従する。
 */
export async function truncateAllData(
  prisma: PrismaClient,
  opts: { dryRun: boolean },
): Promise<ResetDbReport> {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
       ORDER BY tablename`,
  );
  const tables = rows.map((r) => r.tablename);

  if (opts.dryRun || tables.length === 0) {
    return { tables, executed: false };
  }

  const list = tables.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  return { tables, executed: true };
}
