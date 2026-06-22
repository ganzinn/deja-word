// 既存の掲載箇所に登録済みの単語へ、関連語（RelatedWord）を CSV から一括登録する。
// 単語を `db:import-words` で登録した後に走らせる。リンクは掲載番号（occurrence_number）で解決する。
//
// CSV: ヘッダ `headword,kind,term,meaning,link_number`（関連語 1 件＝1 行）。
//   headword   … 親単語（既に登録済みであること）
//   kind       … SYNONYM / ANTONYM / DERIVATIVE（enum キー）
//   term       … 関連語の語
//   meaning    … 関連語の訳（任意）
//   link_number… リンク先の掲載番号（任意）。同じ掲載箇所の該当番号の単語に linkedWordId を張る。
//
// Usage:
//   pnpm db:import-related-words                                                  # 対話モード
//   pnpm db:import-related-words <location> <csvPath>                             # system 宛て・ドライラン
//   pnpm db:import-related-words <location> <csvPath> --execute                   # system 宛て・実登録
//   pnpm db:import-related-words <location> <csvPath> --email=foo@bar.com         # 個人ユーザー宛て
import "dotenv/config";
import { readFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "../src/generated/prisma/client";
import { relatedWordKinds } from "../src/lib/mock/related-word-kinds";
import {
  OccurrenceNotFoundError,
  type RelatedImportReport,
  type RelatedImportRow,
  SystemUserMissingError,
  UserNotFoundByEmailError,
  importRelatedWords,
} from "../src/lib/related-word-import";

const EXPECTED_HEADER = ["headword", "kind", "term", "meaning", "link_number"];

function usage(): never {
  console.error(
    "Usage: pnpm db:import-related-words [<location> <csvPath>] [--email=<addr>] [--execute]",
  );
  console.error("  引数なしで実行すると対話モードになります。--email 省略時は system 宛て。");
  console.error(`  CSV ヘッダ: ${EXPECTED_HEADER.join(",")}`);
  process.exit(1);
}

function isRelatedKind(value: string): boolean {
  return (relatedWordKinds as readonly string[]).includes(value);
}

function printReport(report: RelatedImportReport): void {
  const target = report.isSystem ? `system (${report.ownerEmail})` : report.ownerEmail;
  console.log(`登録先            : ${target}`);
  console.log(`掲載箇所          : "${report.location}" (id=${report.occurrenceId})`);
  console.log("結果:");
  console.log(`  CSV 行数        : ${report.totalRows}`);
  console.log(
    `  関連語${report.executed ? "登録" : "予定"}  : ${report.executed ? report.created : report.willCreate}`,
  );
  console.log(`  リンク解決      : ${report.linksResolved}`);
  console.log(`  word 未検出     : ${report.skipped.length}`);
  for (const s of report.skipped) console.log(`    - ${s.headword} / ${s.term}`);
  console.log(`  未解決リンク    : ${report.unresolvedLinks.length}`);
  for (const u of report.unresolvedLinks) {
    console.log(`    - ${u.headword} / ${u.term} ⇒ ${u.linkNumber} (${u.reason})`);
  }
}

class CsvError extends Error {}

/** related CSV を読み込み RelatedImportRow[] に変換する。kind が enum 外ならエラー。 */
function readRows(csvPath: string): RelatedImportRow[] {
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
  if (EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new CsvError(
      `CSV ヘッダは ${EXPECTED_HEADER.join(",")} である必要があります。実際: ${header.join(",")}`,
    );
  }

  const rows: RelatedImportRow[] = [];
  const invalidKinds = new Map<string, { count: number; sample: string }>();
  for (let i = 1; i < records.length; i++) {
    const rec = records[i] ?? [];
    const headword = (rec[0] ?? "").trim();
    const kind = (rec[1] ?? "").trim();
    const term = (rec[2] ?? "").trim();
    const meaning = (rec[3] ?? "").trim();
    const linkRaw = (rec[4] ?? "").trim();
    if (headword === "" || term === "") continue; // 不完全行は無視
    if (!isRelatedKind(kind)) {
      const hit = invalidKinds.get(kind);
      if (hit) hit.count += 1;
      else invalidKinds.set(kind, { count: 1, sample: `${headword}/${term}` });
      continue;
    }
    const linkNumber = linkRaw === "" ? null : Number.parseInt(linkRaw, 10);
    rows.push({
      headword,
      kind: kind as RelatedImportRow["kind"],
      term,
      meaning: meaning === "" ? null : meaning,
      linkNumber: linkNumber !== null && Number.isNaN(linkNumber) ? null : linkNumber,
    });
  }
  if (invalidKinds.size > 0) {
    const detail = [...invalidKinds.entries()]
      .map(([label, { count, sample }]) => `${label || "(空)"}(${count}件, 例: ${sample})`)
      .join(", ");
    throw new CsvError(`kind が enum 外です。${relatedWordKinds.join("/")} のいずれか: ${detail}`);
  }
  return rows;
}

function loadRows(csvPath: string): RelatedImportRow[] | null {
  const rows = readRows(csvPath);
  if (rows.length === 0) {
    console.error("登録対象の行がありません。");
    return null;
  }
  return rows;
}

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
  const report = await importRelatedWords(prisma, { email, location }, rows, { dryRun: !execute });
  printReport(report);
  console.log(
    report.executed
      ? "\n✓ 登録しました。"
      : "\n[dry-run] 変更はありません。実登録するには --execute を付けて再実行してください。",
  );
}

async function runInteractive(prisma: PrismaClient): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const emailRaw = (
      await rl.question("登録先ユーザーの email（空 Enter で system 共有マスタ）: ")
    ).trim();
    const email = emailRaw || undefined;

    const location = (await rl.question("掲載箇所名（単語を登録済みのもの）: ")).trim();
    if (location === "") {
      console.error("掲載箇所名は必須です。中止します。");
      process.exitCode = 1;
      return;
    }
    const csvPath = (await rl.question("related CSV ファイルパス: ")).trim();
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

    const preview = await importRelatedWords(prisma, { email, location }, rows, { dryRun: true });
    console.log("");
    printReport(preview);

    const mode = (
      await rl.question("\nモードを選択 [1] ドライランのみ(終了) / [2] 実登録 : ")
    ).trim();
    if (mode !== "2") {
      console.log("\n[dry-run] 変更はありません。");
      return;
    }
    const report = await importRelatedWords(prisma, { email, location }, rows, { dryRun: false });
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
    if (e instanceof OccurrenceNotFoundError) {
      console.error(
        `掲載箇所「${e.location}」が見つかりません。先に db:import-words で単語を登録してください。`,
      );
      process.exit(1);
    }
    if (e instanceof CsvError) {
      console.error(e.message);
      process.exit(1);
    }
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
