import { beforeEach, describe, expect, test, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { truncateAllData } from "@/lib/db-reset";

/** pg_tables の問い合わせ結果を模した PrismaClient を作る。 */
function makePrisma(tablenames: string[]) {
  const queryRawUnsafe = vi.fn<(sql: string) => Promise<{ tablename: string }[]>>(async () =>
    tablenames.map((tablename) => ({ tablename })),
  );
  const executeRawUnsafe = vi.fn<(sql: string) => Promise<number>>(async () => 0);
  const prisma = { $queryRawUnsafe: queryRawUnsafe, $executeRawUnsafe: executeRawUnsafe };
  return { prisma: prisma as unknown as PrismaClient, queryRawUnsafe, executeRawUnsafe };
}

describe("truncateAllData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("dry-run は対象テーブルを返すが TRUNCATE を実行しない", async () => {
    const { prisma, executeRawUnsafe } = makePrisma(["user", "word"]);

    const report = await truncateAllData(prisma, { dryRun: true });

    expect(report.executed).toBe(false);
    expect(report.tables).toEqual(["user", "word"]);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  test("対象テーブルの取得クエリは _prisma_migrations を除外する", async () => {
    const { prisma, queryRawUnsafe } = makePrisma(["user"]);

    await truncateAllData(prisma, { dryRun: true });

    const sql = queryRawUnsafe.mock.calls[0]![0];
    expect(sql).toContain("_prisma_migrations");
    expect(sql).toContain("schemaname = 'public'");
  });

  test("--execute 相当では取得した全テーブルを CASCADE で TRUNCATE する", async () => {
    const { prisma, executeRawUnsafe } = makePrisma(["user", "word"]);

    const report = await truncateAllData(prisma, { dryRun: false });

    expect(report.executed).toBe(true);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = executeRawUnsafe.mock.calls[0]![0];
    expect(sql).toContain('TRUNCATE TABLE "user", "word"');
    expect(sql).toContain("RESTART IDENTITY CASCADE");
  });

  test("対象テーブルが 0 件なら executed=false で TRUNCATE しない", async () => {
    const { prisma, executeRawUnsafe } = makePrisma([]);

    const report = await truncateAllData(prisma, { dryRun: false });

    expect(report.executed).toBe(false);
    expect(report.tables).toEqual([]);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });
});
