// 掲載箇所（Occurrence）を新規作成し、CSV の英単語・意味（Meaning / MeaningText）を一括登録する。
// email 未指定なら system ユーザー所有（共有マスタ）として登録する。
//
// CSV: ヘッダ `headword,part_of_speech,meaning_text`（1 行＝1 単語＝1 Meaning）。
//   meaning_text は `;` 区切りで複数 MeaningText に分割する（例 どこにでもある;遍在する）。
//   part_of_speech は任意（空なら無し）。
//
// Usage:
//   pnpm db:import-words                                          # 対話モード（順に設定を入力）
//   pnpm db:import-words <location> <csvPath>                     # system 宛て・ドライラン
//   pnpm db:import-words <location> <csvPath> --execute           # system 宛て・実登録
//   pnpm db:import-words <location> <csvPath> --email=foo@bar.com # 個人ユーザー宛て
import "dotenv/config";
import { readFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  type BulkImportReport,
  type BulkImportRow,
  DuplicateOccurrenceLocationError,
  SystemUserMissingError,
  UserNotFoundByEmailError,
  bulkImportWords,
} from "../src/lib/bulk-word-import";

const MEANING_TEXT_SEPARATOR = ";";
const EXPECTED_HEADER = ["headword", "part_of_speech", "meaning_text"];

function usage(): never {
  console.error("Usage: pnpm db:import-words [<location> <csvPath>] [--email=<addr>] [--execute]");
  console.error("  引数なしで実行すると対話モード（順に設定を入力）になります。");
  console.error("  --email 省略時は system ユーザー（共有マスタ）として登録します。");
  console.error(
    `  CSV ヘッダ: ${EXPECTED_HEADER.join(",")}（meaning_text は "${MEANING_TEXT_SEPARATOR}" 区切り）`,
  );
  process.exit(1);
}

const REASON_LABEL: Record<BulkImportReport["skipped"][number]["reason"], string> = {
  duplicate: "既存単語",
  duplicate_in_csv: "CSV 内重複",
  no_meaning: "意味なし",
};

function printReport(report: BulkImportReport): void {
  const target = report.isSystem ? `system (${report.ownerEmail})` : report.ownerEmail;
  console.log(`登録先            : ${target}`);
  console.log(
    `掲載箇所          : "${report.location}"${report.occurrenceId ? ` (id=${report.occurrenceId})` : " (未作成)"}`,
  );
  console.log(`プリセット付与    : ${report.presetSettings} ユーザー`);
  console.log("結果:");
  console.log(`  CSV 行数        : ${report.totalRows}`);
  console.log(
    `  登録${report.executed ? "    " : "予定"}(Word) : ${report.executed ? report.created : report.willCreate}`,
  );
  console.log(`  スキップ        : ${report.skipped.length}`);
  if (report.skipped.length > 0) {
    for (const s of report.skipped) {
      console.log(`    - ${s.headword} (${REASON_LABEL[s.reason]})`);
    }
  }
}

class CsvError extends Error {}

/** CSV を読み込み、前処理済みの BulkImportRow[] に変換する。空 headword 行は除外して件数を返す。 */
function readRows(csvPath: string): { rows: BulkImportRow[]; dropped: number } {
  let content: string;
  try {
    content = readFileSync(csvPath, "utf8");
  } catch {
    throw new CsvError(`CSV ファイルを読み込めません: ${csvPath}`);
  }
  const records = parse(content, {
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];

  if (records.length === 0) throw new CsvError("CSV が空です。");
  const header = (records[0] ?? []).map((h) => h.trim());
  const headerOk =
    header[0] === EXPECTED_HEADER[0] &&
    header[1] === EXPECTED_HEADER[1] &&
    header[2] === EXPECTED_HEADER[2];
  if (!headerOk) {
    throw new CsvError(
      `CSV ヘッダは ${EXPECTED_HEADER.join(",")} である必要があります。実際: ${header.join(",")}`,
    );
  }

  const rows: BulkImportRow[] = [];
  let dropped = 0;
  for (let i = 1; i < records.length; i++) {
    const rec = records[i]!;
    const headword = (rec[0] ?? "").trim();
    if (headword === "") {
      dropped += 1;
      continue;
    }
    const partOfSpeech = (rec[1] ?? "").trim();
    // 引用符なしで meaning_text 内にカンマがあっても拾えるよう 3 列目以降を結合して復元する。
    const meaningTextRaw = rec.slice(2).join(",");
    const meaningTexts = meaningTextRaw
      .split(MEANING_TEXT_SEPARATOR)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    rows.push({
      headword,
      partOfSpeech: partOfSpeech.length > 0 ? partOfSpeech : null,
      meaningTexts,
    });
  }
  return { rows, dropped };
}

/** CSV を読んで件数注意書きを出し、登録対象が無ければ中止する。失敗時は CsvError を投げる。 */
function loadRows(csvPath: string): BulkImportRow[] | null {
  const { rows, dropped } = readRows(csvPath);
  if (dropped > 0) console.log(`（headword 空の ${dropped} 行を除外しました）`);
  if (rows.length === 0) {
    console.error("登録対象の行がありません。");
    return null;
  }
  return rows;
}

/** dry-run / 実登録を実行してレポートを出す（非対話の確定実行）。 */
async function runWithArgs(
  prisma: PrismaClient,
  email: string | undefined,
  location: string,
  csvPath: string,
  execute: boolean,
): Promise<void> {
  const rows = loadRows(csvPath);
  if (!rows) {
    process.exitCode = 1;
    return;
  }
  const report = await bulkImportWords(prisma, { email, location }, rows, { dryRun: !execute });
  printReport(report);
  if (report.executed) {
    console.log("\n✓ 登録しました。");
  } else {
    console.log(
      "\n[dry-run] 変更はありません。実登録するには --execute を付けて再実行してください。",
    );
  }
}

/** 対話: 登録先 → 掲載箇所名 → CSV パス → ドライラン提示 → モード選択 →（実登録）。 */
async function runInteractive(prisma: PrismaClient): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const emailRaw = (
      await rl.question("登録先ユーザーの email（空 Enter で system 共有マスタ）: ")
    ).trim();
    const email = emailRaw || undefined;

    const location = (await rl.question("掲載箇所名: ")).trim();
    if (location === "") {
      console.error("掲載箇所名は必須です。中止します。");
      process.exitCode = 1;
      return;
    }

    const csvPath = (await rl.question("CSV ファイルパス: ")).trim();
    if (csvPath === "") {
      console.error("CSV パスは必須です。中止します。");
      process.exitCode = 1;
      return;
    }

    const rows = loadRows(csvPath);
    if (!rows) {
      process.exitCode = 1;
      return;
    }

    // まずドライランで件数・スキップを提示する。
    const preview = await bulkImportWords(prisma, { email, location }, rows, { dryRun: true });
    console.log("");
    printReport(preview);

    const mode = (
      await rl.question("\nモードを選択 [1] ドライランのみ(終了) / [2] 実登録 : ")
    ).trim();
    if (mode !== "2") {
      console.log("\n[dry-run] 変更はありません。");
      return;
    }

    const report = await bulkImportWords(prisma, { email, location }, rows, { dryRun: false });
    console.log("");
    printReport(report);
    console.log("\n✓ 登録しました。");
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const emailArg = args
    .find((a) => a.startsWith("--email="))
    ?.slice("--email=".length)
    .trim();
  const positional = args.filter((a) => !a.startsWith("--"));

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
    if (positional.length === 0) {
      if (!stdin.isTTY) {
        console.error("対話モードには TTY が必要です。<location> <csvPath> を指定してください。");
        usage();
      }
      await runInteractive(prisma);
      return;
    }
    const [location, csvPath] = positional;
    if (!location || !csvPath) usage();
    await runWithArgs(prisma, emailArg || undefined, location, csvPath, execute);
  } catch (e) {
    if (e instanceof UserNotFoundByEmailError) {
      console.error(`ユーザーが見つかりません: ${e.email}`);
      process.exit(1);
    }
    if (e instanceof SystemUserMissingError) {
      console.error("system ユーザーが存在しません。先に pnpm db:seed を実行してください。");
      process.exit(1);
    }
    if (e instanceof DuplicateOccurrenceLocationError) {
      console.error(
        `掲載箇所「${e.location}」は既に存在します。別名にするか既存を整理してください。`,
      );
      process.exit(1);
    }
    if (e instanceof CsvError) {
      console.error(e.message);
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
