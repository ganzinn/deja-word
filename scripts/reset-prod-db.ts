// DB の全テーブルのデータを TRUNCATE する（スキーマ・マイグレーション履歴は保持）。
// 本番リセット手順の中核。発音音源 Blob は別途 `pnpm db:purge-blobs --execute` を
// この操作より「前」に実行すること（TRUNCATE すると URL が消え Blob が孤児化する）。
// TRUNCATE 後は `pnpm db:seed`（system ユーザー再作成）と
// `pnpm db:set-system-password`（管理パスワード再設定）が必要。
//
// Usage:
//   pnpm db:reset-prod             # ドライラン（対象テーブルと件数表示のみ・無変更）
//   pnpm db:reset-prod --execute   # 実行（yes 確認あり。非対話 stdin では拒否）
import "dotenv/config";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { truncateAllData } from "../src/lib/db-reset";

/** 各テーブルの行数を取得して表示用に整形する。 */
async function printCounts(prisma: PrismaClient, tables: string[]): Promise<void> {
  console.log("対象テーブル（データを全削除）:");
  const width = tables.reduce((m, t) => Math.max(m, t.length), 0);
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM "${t}"`,
    );
    const count = rows[0]?.count ?? "0";
    console.log(`  ${t.padEnd(width)} : ${count}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");

  const connectionString =
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL_UNPOOLED"] ??
    process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("DATABASE_URL / DATABASE_URL_UNPOOLED / DIRECT_URL is not set");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    // まず対象テーブルと件数を提示する（dry-run / execute 共通）。
    const preview = await truncateAllData(prisma, { dryRun: true });
    if (preview.tables.length === 0) {
      console.log("対象テーブルがありません。");
      return;
    }
    await printCounts(prisma, preview.tables);

    if (!execute) {
      console.log(
        "\n[dry-run] 変更はありません。実行するには --execute を付けて再実行してください。",
      );
      return;
    }

    if (!stdin.isTTY) {
      console.error("\n--execute には確認用の TTY が必要です。対話端末から実行してください。");
      process.exit(1);
    }

    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const ans = (
        await rl.question(
          `\n上記 ${preview.tables.length} テーブルのデータを全削除します。続行するには yes と入力: `,
        )
      ).trim();
      if (ans !== "yes") {
        console.log("中止しました。");
        process.exitCode = 1;
        return;
      }
    } finally {
      rl.close();
    }

    const report = await truncateAllData(prisma, { dryRun: false });
    console.log(`\n✓ ${report.tables.length} テーブルのデータを削除しました。`);
    console.log(
      "  次に `pnpm db:seed`（system ユーザー再作成）と" +
        " `pnpm db:set-system-password`（管理パスワード再設定）を実行してください。",
    );
  } catch (e) {
    // 確認プロンプト中の Ctrl+C / Ctrl+D（EOF）は中止扱いにする。
    if (e instanceof Error && e.name === "AbortError") {
      console.log("\n中止しました。");
      return;
    }
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
