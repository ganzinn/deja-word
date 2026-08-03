// 既存の掲載箇所に登録済みの単語へ、発音音源（mp3）をディレクトリから一括登録する。
// 単語を `db:import-words` で登録した後に走らせる。突合は掲載番号（occurrence_number）。
//
// 音源ディレクトリ: `<掲載番号>.mp3` または `<掲載番号>_<見出し語メモ>.mp3`（例 0004.mp3 / 0004_mean.mp3）。
//   連番は 0 埋めの有無を問わない。`_` 以降は突合に使わず、DB の見出し語と食い違う場合に
//   警告として一覧表示するだけ（登録は掲載番号を正とする）。mp3 以外のファイルは無視する。
//   登録先は対象単語の**先頭 Meaning**（表示・出題とも先頭 Meaning の音源を使うため）。
//   既に音源が登録済みの行は常にスキップするので、中断しても再実行で続きから再開できる。
//
// Usage:
//   pnpm db:import-audio                                                    # 対話モード
//   pnpm db:import-audio <location> <audioDir>                              # system 宛て・ドライラン
//   pnpm db:import-audio <location> <audioDir> --execute                    # system 宛て・実登録
//   pnpm db:import-audio <location> <audioDir> --email=foo@bar.com          # 個人ユーザー宛て
import "dotenv/config";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  type AudioImportReport,
  type AudioImportRow,
  type AudioSkipReason,
  OccurrenceNotFoundError,
  SystemUserMissingError,
  UserNotFoundByEmailError,
  importPronunciationAudio,
} from "../src/lib/audio-import";
import { defaultBlobClient } from "../src/lib/blob-client-impl";
import {
  BlobDriverMismatchError,
  assertBlobDriverMatchesDatabase,
} from "../src/lib/blob-driver-guard";

/** `0004.mp3` / `0004_mean.mp3` を掲載番号と見出し語メモに分解する。 */
const FILE_NAME_PATTERN = /^(\d+)(?:_(.+))?\.mp3$/i;
/** Web からのアップロード（pronunciation-audio.ts）と同じ上限に揃える。 */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** 明細を全件は出さない一覧の表示件数（残りは「他 N 件」と明示する）。 */
const SAMPLE_LIMIT = 10;

function usage(): never {
  console.error("Usage: pnpm db:import-audio [<location> <audioDir>] [--email=<addr>] [--execute]");
  console.error("  引数なしで実行すると対話モードになります。--email 省略時は system 宛て。");
  console.error("  音源ファイル名: <掲載番号>.mp3 または <掲載番号>_<見出し語メモ>.mp3");
  process.exit(1);
}

class AudioDirError extends Error {}

const REASON_LABEL: Record<AudioSkipReason, string> = {
  word_not_found: "掲載番号に単語なし",
  no_meaning: "意味なし",
  already_registered: "音源登録済み",
  duplicate_number: "掲載番号の重複",
};

/** 件数 + 先頭 SAMPLE_LIMIT 件だけを出し、打ち切った残数を明示する。 */
function printSample(lines: string[], indent = "    "): void {
  for (const line of lines.slice(0, SAMPLE_LIMIT)) console.log(`${indent}- ${line}`);
  if (lines.length > SAMPLE_LIMIT) {
    console.log(`${indent}… 他 ${lines.length - SAMPLE_LIMIT} 件`);
  }
}

function printReport(report: AudioImportReport): void {
  const target = report.isSystem ? `system (${report.ownerEmail})` : report.ownerEmail;
  console.log(`登録先            : ${target}`);
  console.log(`掲載箇所          : "${report.location}" (id=${report.occurrenceId})`);
  console.log("結果:");
  console.log(`  音源ファイル数  : ${report.totalFiles}`);
  console.log(
    `  登録${report.executed ? "    " : "予定"}      : ${report.executed ? report.uploaded : report.willUpload}`,
  );
  console.log(`  スキップ        : ${report.skipped.length}`);
  const byReason = new Map<AudioSkipReason, string[]>();
  for (const s of report.skipped) {
    const list = byReason.get(s.reason) ?? [];
    list.push(`${s.fileName}${s.headword ? ` (${s.headword})` : ""}`);
    byReason.set(s.reason, list);
  }
  for (const [reason, list] of byReason) {
    console.log(`    ${REASON_LABEL[reason]}: ${list.length}`);
    printSample(list, "      ");
  }
  console.log(`  音源が付かない掲載番号: ${report.numbersWithoutFile.length}`);
  printSample(report.numbersWithoutFile.map(String));

  // ファイル名のメモと DB の見出し語の食い違いは全件出す（登録内容の目視レビュー用）。
  console.log(
    `  ファイル名メモの不一致: ${report.mismatches.length} 件（登録は掲載番号を正とする）`,
  );
  for (const m of report.mismatches) {
    console.log(`    - ${m.fileName} : メモ "${m.headwordHint}" / DB "${m.headword}"`);
  }

  if (report.failures.length > 0) {
    console.log(`  失敗            : ${report.failures.length}`);
    for (const f of report.failures) {
      console.log(`    - ${f.fileName} (${f.headword}): ${f.message}`);
    }
  }
}

/** 音源ディレクトリを走査し、投入行に変換する。壊れた入力は登録前にエラーで止める。 */
async function readAudioDir(dirPath: string): Promise<AudioImportRow[]> {
  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    throw new AudioDirError(`音源ディレクトリを読み込めません: ${dirPath}`);
  }

  const rows: AudioImportRow[] = [];
  const ignored: string[] = [];
  const invalid: string[] = [];
  for (const name of entries.sort()) {
    const matched = FILE_NAME_PATTERN.exec(name);
    if (!matched) {
      ignored.push(name);
      continue;
    }
    const filePath = join(dirPath, name);
    const info = await stat(filePath);
    if (!info.isFile()) {
      ignored.push(name);
      continue;
    }
    if (info.size === 0) invalid.push(`${name} (空ファイル)`);
    if (info.size > MAX_AUDIO_BYTES) invalid.push(`${name} (${info.size} バイト > 4MB)`);
    rows.push({
      occurrenceNumber: Number.parseInt(matched[1]!, 10),
      fileName: name,
      headwordHint: matched[2] ?? null,
      readBytes: () => readFile(filePath),
    });
  }

  if (ignored.length > 0) {
    console.log(
      `（mp3 以外の ${ignored.length} 件を無視しました: ${ignored.slice(0, 5).join(", ")}）`,
    );
  }
  if (invalid.length > 0) {
    throw new AudioDirError(`音源ファイルが不正です:\n  - ${invalid.join("\n  - ")}`);
  }
  return rows;
}

async function loadRows(dirPath: string): Promise<AudioImportRow[] | null> {
  const rows = await readAudioDir(dirPath);
  if (rows.length === 0) {
    console.error("登録対象の音源ファイルがありません。");
    return null;
  }
  return rows;
}

/** 実登録は 1 件ずつ put → update で長時間かかるため、進捗を定期的に出す。 */
function createProgressPrinter(): (done: number, total: number) => void {
  const startedAt = Date.now();
  return (done, total) => {
    if (done % 50 !== 0 && done !== total) return;
    const elapsed = (Date.now() - startedAt) / 1000;
    const eta = done > 0 ? (elapsed / done) * (total - done) : 0;
    console.log(
      `  ... ${done}/${total} 件 (経過 ${elapsed.toFixed(0)}s / 残り目安 ${eta.toFixed(0)}s)`,
    );
  };
}

async function runImport(
  prisma: PrismaClient,
  connectionString: string,
  email: string | undefined,
  location: string,
  rows: AudioImportRow[],
  execute: boolean,
): Promise<AudioImportReport> {
  // DB 接続先と Blob driver は別々に決まるため、実書き込みの直前に組み合わせを検査する
  // （本番 DB × dev のローカルディスク driver で本番に /api/dev-blob/… を書く事故の防止）。
  if (execute) assertBlobDriverMatchesDatabase(connectionString, defaultBlobClient);
  return importPronunciationAudio(
    prisma,
    defaultBlobClient,
    { email, location },
    rows,
    execute ? { dryRun: false, onProgress: createProgressPrinter() } : { dryRun: true },
  );
}

/** 実登録後の締めの表示。失敗があれば終了コードを 1 にする（再実行で続きから復旧できる）。 */
function printOutcome(report: AudioImportReport): void {
  if (!report.executed) {
    console.log(
      "\n[dry-run] 変更はありません。実登録するには --execute を付けて再実行してください。",
    );
    return;
  }
  if (report.failures.length > 0) {
    console.log(`\n△ ${report.uploaded} 件を登録し、${report.failures.length} 件が失敗しました。`);
    console.log("  同じコマンドを再実行すると、登録済みはスキップされ失敗分だけ再試行されます。");
    process.exitCode = 1;
    return;
  }
  console.log("\n✓ 登録しました。");
}

async function runWithArgs(
  prisma: PrismaClient,
  connectionString: string,
  email: string | undefined,
  location: string,
  dirPath: string,
  execute: boolean,
): Promise<void> {
  const rows = await loadRows(dirPath);
  if (!rows) {
    process.exitCode = 1;
    return;
  }
  const report = await runImport(prisma, connectionString, email, location, rows, execute);
  printReport(report);
  printOutcome(report);
}

async function runInteractive(prisma: PrismaClient, connectionString: string): Promise<void> {
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
    const dirPath = (await rl.question("音源ディレクトリのパス: ")).trim();
    if (dirPath === "") {
      console.error("音源ディレクトリは必須です。中止します。");
      process.exitCode = 1;
      return;
    }

    const rows = await loadRows(dirPath);
    if (!rows) {
      process.exitCode = 1;
      return;
    }

    const preview = await runImport(prisma, connectionString, email, location, rows, false);
    console.log("");
    printReport(preview);

    const mode = (
      await rl.question("\nモードを選択 [1] ドライランのみ(終了) / [2] 実登録 : ")
    ).trim();
    if (mode !== "2") {
      console.log("\n[dry-run] 変更はありません。");
      return;
    }
    const report = await runImport(prisma, connectionString, email, location, rows, true);
    console.log("");
    printReport(report);
    printOutcome(report);
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
        console.error("対話モードには TTY が必要です。<location> <audioDir> を指定してください。");
        usage();
      }
      await runInteractive(prisma, connectionString);
      return;
    }
    const [location, dirPath] = positional;
    if (!location || !dirPath) usage();
    await runWithArgs(prisma, connectionString, emailArg || undefined, location, dirPath, execute);
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
    if (e instanceof BlobDriverMismatchError) {
      console.error(
        `中止: DB 接続先 (${e.databaseHost}) はリモートですが、Blob は dev のローカルディスク driver です。`,
      );
      console.error(
        "  そのまま登録すると本番 DB に /api/dev-blob/… の URL（本番では 404）が入ります。",
      );
      console.error(
        "  BLOB_READ_WRITE_TOKEN を設定してから再実行してください（vercel env pull では sensitive な値が空で落ちてくることがあります）。",
      );
      process.exit(1);
    }
    if (e instanceof AudioDirError) {
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
