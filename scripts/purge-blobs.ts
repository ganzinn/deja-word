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
import {
  BlobDriverMismatchError,
  assertBlobDriverMatchesDatabase,
} from "../src/lib/blob-driver-guard";
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
    // DB 接続先と Blob driver は別々に決まるため、実削除の直前に組み合わせを検査する。
    // ローカルディスク driver の del は `/api/dev-blob/` 以外の URL を黙って無視するので、
    // このまま走ると「1 件も消えていないのに成功表示」という静かな失敗になる。
    if (execute) assertBlobDriverMatchesDatabase(connectionString, defaultBlobClient);
    const report = await purgeAllAudioBlobs(prisma, defaultBlobClient, { dryRun: !execute });
    console.log(`発音音源(Blob): ${report.audioFiles}`);
    if (!report.executed) {
      console.log(
        "\n[dry-run] 変更はありません。実削除するには --execute を付けて再実行してください。",
      );
    } else if (report.deleteError) {
      // 削除失敗で DB が壊れることは無い（孤児 Blob が残るだけ）が、成功と同じ表示にすると
      // 「1 件も消えていないのに ✓」になるため、明示して終了コードも 1 にする。
      console.error(`\n✗ Blob を削除できませんでした（${report.audioFiles} 件がそのまま残存）。`);
      console.error("  DB は無変更なので、原因を解消して再実行すれば同じ URL をやり直せます。");
      console.error("  原因:", report.deleteError);
      process.exitCode = 1;
    } else {
      console.log("\n✓ Blob を削除しました。");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  if (err instanceof BlobDriverMismatchError) {
    console.error(
      `中止: DB 接続先 (${err.databaseHost}) はリモートですが、Blob は dev のローカルディスク driver です。`,
    );
    console.error(
      "  この driver の del は /api/dev-blob/ 以外の URL を無視するため、そのまま実行すると",
    );
    console.error("  Blob が 1 件も消えないまま「✓ 削除しました」と表示されます。");
    console.error(
      "  BLOB_READ_WRITE_TOKEN を設定してから再実行してください（vercel env pull では sensitive な値が空で落ちてくることがあります）。",
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
