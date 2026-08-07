// 掲載箇所（Occurrence）配下の単語コンテンツを中間 JSON に書き出す。**読み取りしかしない**。
// 書き出した JSON は `pnpm db:sync-occurrence` で別環境の DB へ反映する。
//
// ■ 接続先は `SOURCE_DATABASE_URL` のみ
//   他の運用スクリプトと違い `DATABASE_URL` にフォールバックしない。取り違えて手元の DB を
//   エクスポートしても気付けないため、専用の変数を要求する。接続文字列はコミット対象外の
//   env ファイルに置いて `pnpm dotenv -e <file> -- ...` で渡すこと（docs/ops/sync-occurrence.md）。
//
// Usage:
//   pnpm db:export-occurrence                                              # 対話モード
//   pnpm db:export-occurrence <掲載箇所名>                                 # system 所有・全掲載番号
//   pnpm db:export-occurrence <掲載箇所名> <レンジ>                        # 例 1-100,1581-1600
//   pnpm db:export-occurrence <掲載箇所名> <レンジ> --email=foo@bar.com    # 個人ユーザー所有
//   pnpm db:export-occurrence <掲載箇所名> <レンジ> --out tmp/foo.json     # 出力先の指定
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  SystemUserMissingError,
  UserNotFoundByEmailError,
  resolveImportOwner,
} from "../src/lib/import-owner";
import { type OccurrenceListItem, listOccurrences } from "../src/lib/occurrence-purge";
import {
  type ExportReport,
  InvalidNumberRangeError,
  formatOccurrenceNumberRanges,
  exportOccurrence,
  parseOccurrenceNumberRanges,
} from "../src/lib/occurrence-sync";

const DEFAULT_OUT = "tmp/occurrence-export.json";
/** 明細を全件は出さない一覧の表示件数（残りは「他 N 件」と明示する）。 */
const SAMPLE_LIMIT = 20;

function usage(): never {
  console.error(
    "Usage: pnpm db:export-occurrence [<掲載箇所名> [<レンジ>]] [--email=<addr>] [--out <path>]",
  );
  console.error("  引数なしで実行すると対話モード（一覧から選択）になります。");
  console.error("  --email 省略時は system ユーザー（共有マスタ）所有の掲載箇所を探します。");
  console.error("  レンジは掲載番号の指定（例: 1-100,1581-1600 / 7）。省略で全掲載番号。");
  process.exit(1);
}

/** 接続先の取り違えに気付けるようホスト名だけ表示する（資格情報は出さない）。 */
function describeHost(connectionString: string): string {
  try {
    return new URL(connectionString).hostname || "(unknown)";
  } catch {
    return "(unparsable)";
  }
}

function printSample(values: string[], indent = "    "): void {
  for (const v of values.slice(0, SAMPLE_LIMIT)) console.log(`${indent}- ${v}`);
  if (values.length > SAMPLE_LIMIT) {
    console.log(`${indent}… 他 ${values.length - SAMPLE_LIMIT} 件`);
  }
}

function printReport(report: ExportReport, outPath: string): void {
  const { data } = report;
  const owner = data.occurrence.owner;
  console.log(`掲載箇所          : "${data.occurrence.location}"`);
  console.log(
    `所有ユーザー      : ${owner.name} <${owner.email}>${owner.isSystem ? " (system)" : ""}`,
  );
  console.log(
    `掲載番号の指定    : ${report.requestedCount === null ? "なし（全件）" : `${report.requestedCount} 件`}`,
  );
  console.log("結果:");
  console.log(`  書き出し単語数  : ${data.entries.length}`);
  console.log(
    `  掲載箇所の単語数: ${report.totalLinks}（うち掲載番号なし: ${report.withoutNumber}）`,
  );
  const totals = data.entries.reduce(
    (acc, e) => ({
      meanings: acc.meanings + e.meanings.length,
      examples: acc.examples + e.examples.length,
      related: acc.related + e.related.length,
      memos: acc.memos + e.memos.length,
    }),
    { meanings: 0, examples: 0, related: 0, memos: 0 },
  );
  console.log(
    `  内訳            : 意味 ${totals.meanings} / 例文 ${totals.examples} / 関連語 ${totals.related} / メモ ${totals.memos}`,
  );
  if (report.missingNumbers.length > 0) {
    console.log(`  指定したが不在  : ${report.missingNumbers.length} 件`);
    printSample([formatOccurrenceNumberRanges(report.missingNumbers)]);
  }
  console.log(`\n✓ 書き出しました: ${outPath}`);
  console.log("  次に `pnpm db:sync-occurrence <このパス>` で反映先の DB に取り込みます。");
}

function writeExport(report: ExportReport, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report.data, null, 2)}\n`, "utf8");
}

/** 掲載箇所を「所有ユーザー → 掲載箇所名」で一覧表示する。 */
function printOccurrenceChoices(items: OccurrenceListItem[]): void {
  const width = String(items.length).length;
  let lastOwner: string | null = null;
  items.forEach((it, i) => {
    if (it.ownerId !== lastOwner) {
      console.log(`  ${it.ownerName} <${it.ownerEmail}>`);
      lastOwner = it.ownerId;
    }
    console.log(`    [${String(i + 1).padStart(width)}] ${it.location}  (単語=${it.words})`);
  });
}

async function runInteractive(prisma: PrismaClient): Promise<void> {
  const items = await listOccurrences(prisma);
  if (items.length === 0) {
    console.log("掲載箇所がありません。");
    return;
  }

  console.log("掲載箇所一覧（所有ユーザーごと）:");
  printOccurrenceChoices(items);

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const picked = (await rl.question("\n書き出す掲載箇所の番号を入力 (q で中止): ")).trim();
    if (picked === "" || picked.toLowerCase() === "q") {
      console.log("中止しました。");
      return;
    }
    const idx = Number(picked);
    if (!Number.isInteger(idx) || idx < 1 || idx > items.length) {
      console.error("不正な番号です。中止します。");
      process.exitCode = 1;
      return;
    }
    const target = items[idx - 1]!;

    const rangeInput = (
      await rl.question("掲載番号のレンジ（例 1-100,1581-1600。空 Enter で全件）: ")
    ).trim();
    let numbers: number[] | undefined;
    if (rangeInput !== "") {
      try {
        numbers = parseOccurrenceNumberRanges(rangeInput);
      } catch (e) {
        if (e instanceof InvalidNumberRangeError) {
          console.error(`レンジ指定が不正です: ${e.reason}`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    }

    const outInput = (await rl.question(`出力先（空 Enter で ${DEFAULT_OUT}）: `)).trim();
    const outPath = outInput === "" ? DEFAULT_OUT : outInput;

    const report = await exportOccurrence(prisma, { occurrenceId: target.id, numbers });
    console.log("");
    writeExport(report, outPath);
    printReport(report, outPath);
  } finally {
    rl.close();
  }
}

async function runWithArgs(
  prisma: PrismaClient,
  args: { location: string; ranges?: string; email?: string; out: string },
): Promise<void> {
  const owner = await resolveImportOwner(prisma, args.email);
  const occurrence = await prisma.occurrence.findUnique({
    where: { ownerId_location: { ownerId: owner.ownerId, location: args.location } },
    select: { id: true },
  });
  if (!occurrence) {
    console.error(
      `掲載箇所が見つかりません: "${args.location}"（所有: ${owner.ownerName} <${owner.ownerEmail}>）`,
    );
    console.error("  引数なしで実行すると一覧から選択できます。");
    process.exit(1);
  }

  const numbers = args.ranges ? parseOccurrenceNumberRanges(args.ranges) : undefined;
  const report = await exportOccurrence(prisma, { occurrenceId: occurrence.id, numbers });
  writeExport(report, args.out);
  printReport(report, args.out);
}

async function main() {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  let email: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
    } else if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
    } else if (arg === "--out") {
      out = argv[++i];
      if (!out) usage();
    } else if (arg.startsWith("--")) {
      console.error(`不明なオプション: ${arg}`);
      usage();
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 2) usage();
  const [location, ranges] = positional;

  const connectionString = process.env["SOURCE_DATABASE_URL"];
  if (!connectionString) {
    console.error("SOURCE_DATABASE_URL is not set");
    console.error(
      "  エクスポート元の接続文字列を SOURCE_DATABASE_URL に設定してください" +
        "（コミット対象外の env ファイルに置き `pnpm dotenv -e <file> -- ...` で渡す）。",
    );
    console.error("  手順: docs/ops/sync-occurrence.md");
    process.exit(1);
  }
  console.log(`エクスポート元    : ${describeHost(connectionString)}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (!location) {
      if (!stdin.isTTY) {
        console.error("対話モードには TTY が必要です。掲載箇所名を指定してください。");
        usage();
      }
      await runInteractive(prisma);
      return;
    }
    await runWithArgs(prisma, { location, ranges, email, out: out ?? DEFAULT_OUT });
  } catch (e) {
    if (e instanceof InvalidNumberRangeError) {
      console.error(`レンジ指定が不正です: ${e.reason}`);
      process.exit(1);
    }
    if (e instanceof UserNotFoundByEmailError) {
      console.error(`ユーザーが見つかりません: ${e.email}`);
      process.exit(1);
    }
    if (e instanceof SystemUserMissingError) {
      console.error("system ユーザーがいません。`pnpm db:seed` を実行してください。");
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
