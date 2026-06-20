// 掲載箇所（Occurrence）に紐づく英単語・配下テーブル・発音音源 Blob をまとめて削除する。
// 既定はドライラン（件数表示のみ・無変更）で、`--execute` 指定時のみ実削除する。
// オーナー非依存で Occurrence ID を直接指定する（system occurrence も対象にできる）。
//
// Usage:
//   pnpm db:purge-occurrence <occurrenceId>            # ドライラン
//   pnpm db:purge-occurrence <occurrenceId> --execute  # 実削除
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { defaultBlobClient } from "../src/lib/blob-client-impl";
import { OccurrenceNotFoundError, purgeOccurrence } from "../src/lib/occurrence-purge";

function usage(): never {
  console.error("Usage: pnpm db:purge-occurrence <occurrenceId> [--execute]");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const occurrenceId = args.find((a) => !a.startsWith("--"));
  if (!occurrenceId) usage();

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
    const report = await purgeOccurrence(prisma, defaultBlobClient, occurrenceId, {
      dryRun: !execute,
    });

    console.log(
      `掲載箇所: "${report.occurrence.location}" (id=${report.occurrence.id}, owner=${report.occurrence.ownerId})`,
    );
    console.log("削除対象:");
    console.log(
      `  単語(Word)            : ${report.words}  (うち他掲載箇所と共有: ${report.sharedWords})`,
    );
    console.log(`  意味(Meaning)         : ${report.meanings}`);
    console.log(`  例文(Example)         : ${report.examples}`);
    console.log(`  関連語(RelatedWord)   : ${report.relatedWords}`);
    console.log(`  メモ(Memo)            : ${report.memos}`);
    console.log(`  テスト解答(QuizAnswer): ${report.quizAnswers}`);
    console.log(`  発音音源(Blob)        : ${report.audioFiles}`);
    console.log(`  ドリル(Drill)         : ${report.drills}`);
    console.log(`  プリセット設定        : ${report.presetSettings}`);

    if (report.executed) {
      console.log("\n✓ 削除を実行しました（掲載箇所本体も削除済み）。");
    } else {
      console.log(
        "\n[dry-run] 変更はありません。実削除するには --execute を付けて再実行してください。",
      );
    }
  } catch (e) {
    if (e instanceof OccurrenceNotFoundError) {
      console.error(`occurrence not found: ${occurrenceId}`);
      process.exit(1);
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
