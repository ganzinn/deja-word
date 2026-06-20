// 掲載箇所（Occurrence）に紐づく英単語・配下テーブル・発音音源 Blob をまとめて削除する。
// オーナー非依存で対象を指定する（system occurrence も対象にできる）。
//
// Usage:
//   pnpm db:purge-occurrence                            # 対話モード（一覧から選択）
//   pnpm db:purge-occurrence <occurrenceId>             # ドライラン
//   pnpm db:purge-occurrence <occurrenceId> --execute   # 実削除
import "dotenv/config";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { defaultBlobClient } from "../src/lib/blob-client-impl";
import {
  OccurrenceNotFoundError,
  type PurgeReport,
  listOccurrences,
  purgeOccurrence,
} from "../src/lib/occurrence-purge";

function usage(): never {
  console.error("Usage: pnpm db:purge-occurrence [<occurrenceId> [--execute]]");
  console.error("  引数なしで実行すると対話モード（一覧から選択）になります。");
  process.exit(1);
}

/** 削除対象の件数レポートを表示する（ステータス行は呼び出し側が出す）。 */
function printReport(report: PurgeReport): void {
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
}

/** 非対話: id 指定で dry-run / --execute を実行する。 */
async function runWithId(
  prisma: PrismaClient,
  occurrenceId: string,
  execute: boolean,
): Promise<void> {
  const report = await purgeOccurrence(prisma, defaultBlobClient, occurrenceId, {
    dryRun: !execute,
  });
  printReport(report);
  if (report.executed) {
    console.log("\n✓ 削除を実行しました（掲載箇所本体も削除済み）。");
  } else {
    console.log(
      "\n[dry-run] 変更はありません。実削除するには --execute を付けて再実行してください。",
    );
  }
}

/** 対話: 一覧表示 → 選択 → ドライラン提示 → モード選択 → （実削除なら名前確認）。 */
async function runInteractive(prisma: PrismaClient): Promise<void> {
  const items = await listOccurrences(prisma);
  if (items.length === 0) {
    console.log("掲載箇所がありません。");
    return;
  }

  console.log("掲載箇所一覧:");
  const width = String(items.length).length;
  items.forEach((it, i) => {
    const no = String(i + 1).padStart(width);
    console.log(`  [${no}] ${it.location}  (owner=${it.ownerEmail}, 単語=${it.words})`);
  });

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const ans = (await rl.question("\n削除する掲載箇所の番号を入力 (q で中止): ")).trim();
    if (ans === "" || ans.toLowerCase() === "q") {
      console.log("中止しました。");
      return;
    }
    const idx = Number(ans);
    if (!Number.isInteger(idx) || idx < 1 || idx > items.length) {
      console.error("不正な番号です。中止します。");
      process.exitCode = 1;
      return;
    }
    const target = items[idx - 1]!;

    // まずドライランで件数を提示する。
    const preview = await purgeOccurrence(prisma, defaultBlobClient, target.id, { dryRun: true });
    console.log("");
    printReport(preview);

    const mode = (
      await rl.question("\nモードを選択 [1] ドライランのみ(終了) / [2] 実削除 : ")
    ).trim();
    if (mode !== "2") {
      console.log("\n[dry-run] 変更はありません。");
      return;
    }

    const confirm = (
      await rl.question(
        `\n本当に実削除しますか？ 続行するには掲載箇所名「${target.location}」を入力: `,
      )
    ).trim();
    if (confirm !== target.location) {
      console.log("入力が一致しませんでした。中止します。");
      process.exitCode = 1;
      return;
    }

    const report = await purgeOccurrence(prisma, defaultBlobClient, target.id, { dryRun: false });
    console.log("");
    printReport(report);
    console.log("\n✓ 削除を実行しました（掲載箇所本体も削除済み）。");
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const occurrenceId = args.find((a) => !a.startsWith("--"));

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
    if (!occurrenceId) {
      if (!stdin.isTTY) {
        console.error("対話モードには TTY が必要です。occurrenceId を指定してください。");
        usage();
      }
      await runInteractive(prisma);
      return;
    }
    await runWithId(prisma, occurrenceId, execute);
  } catch (e) {
    if (e instanceof OccurrenceNotFoundError) {
      console.error(`occurrence not found: ${occurrenceId}`);
      process.exit(1);
    }
    // 対話プロンプト中の Ctrl+C / Ctrl+D（EOF）は中止扱いにする。
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
