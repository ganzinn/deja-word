// DB 上のすべての発音音源 Blob を一括削除する。`prisma migrate reset` で DB を
// 全削除する前に実行し、URL がまだ読めるうちに Blob 実体を消すための前段ツール。
//
// Usage:
//   pnpm db:purge-blobs             # ドライラン（件数表示のみ・無変更）
//   pnpm db:purge-blobs --execute   # 実削除
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { defaultBlobClient } from "../src/lib/blob-client-impl";
import { purgeAllAudioBlobs } from "../src/lib/blob-purge";

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
    const report = await purgeAllAudioBlobs(prisma, defaultBlobClient, { dryRun: !execute });
    console.log(`発音音源(Blob): ${report.audioFiles}`);
    if (report.executed) {
      console.log("\n✓ Blob を削除しました。");
    } else {
      console.log(
        "\n[dry-run] 変更はありません。実削除するには --execute を付けて再実行してください。",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
