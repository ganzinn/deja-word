// `pnpm db:export-occurrence` が書き出した中間 JSON を、手元の DB に取り込む。
// 対象単語の意味・例文・関連語・メモ・掲載番号詳細を**丸ごと置き換える**（部分マージはしない）。
// 発音音源 URL は置き換え前に退避して付け直すため、手元に登録済みの音源は失われない。
//
// ■ ローカル DB 専用
//   接続先が localhost 以外なら実行前に中止する。本番へ書き戻すためのツールではない。
//
// Usage:
//   pnpm db:sync-occurrence <jsonPath>                            # 対話モード
//   pnpm db:sync-occurrence <jsonPath> <レンジ>                   # 非対話・ドライラン
//   pnpm db:sync-occurrence <jsonPath> <レンジ> --execute          # 非対話・実反映
//   pnpm db:sync-occurrence <jsonPath> --email=foo@bar.com        # 反映先ユーザーの指定
//   pnpm db:sync-occurrence <jsonPath> --location=<掲載箇所名>     # 反映先掲載箇所名の指定
import "dotenv/config";
import { readFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { isLocalDatabaseUrl } from "../src/lib/blob-driver-guard";
import {
  SystemUserMissingError,
  UserNotFoundByEmailError,
  listImportOwners,
  resolveImportOwner,
} from "../src/lib/import-owner";
import { listOccurrences } from "../src/lib/occurrence-purge";
import {
  InvalidNumberRangeError,
  type OccurrenceExport,
  OccurrenceLocationConflictError,
  type SyncReport,
  type SyncSkipReason,
  UnsupportedExportVersionError,
  assertSupportedExport,
  formatOccurrenceNumberRanges,
  parseOccurrenceNumberRanges,
  syncOccurrence,
} from "../src/lib/occurrence-sync";

/** 明細を全件は出さない一覧の表示件数（残りは「他 N 件」と明示する）。 */
const SAMPLE_LIMIT = 10;

const REASON_LABEL: Record<SyncSkipReason, string> = {
  headword_mismatch: "見出し語の不一致",
  word_linked_to_other_number: "同じ見出し語が別の掲載番号に紐づき済み",
};

const ACTION_LABEL = {
  replaced: "置き換え",
  linked: "掲載番号を追加して置き換え",
  created: "新規作成",
} as const;

function usage(): never {
  console.error(
    "Usage: pnpm db:sync-occurrence <jsonPath> [<レンジ>] [--email=<addr>] [--location=<name>] [--execute]",
  );
  console.error("  jsonPath だけを指定すると対話モード（反映先を一覧から選択）になります。");
  console.error("  --email 省略時は JSON と同じ email のユーザー、無ければ system。");
  console.error("  --location 省略時は JSON の掲載箇所名。無ければ新規作成する。");
  process.exit(1);
}

function printSample(values: string[], indent = "    "): void {
  for (const v of values.slice(0, SAMPLE_LIMIT)) console.log(`${indent}- ${v}`);
  if (values.length > SAMPLE_LIMIT) {
    console.log(`${indent}… 他 ${values.length - SAMPLE_LIMIT} 件`);
  }
}

function readExport(jsonPath: string): OccurrenceExport {
  let raw: string;
  try {
    raw = readFileSync(jsonPath, "utf8");
  } catch {
    console.error(`JSON を読み込めません: ${jsonPath}`);
    process.exit(1);
  }
  let data: OccurrenceExport;
  try {
    data = JSON.parse(raw) as OccurrenceExport;
  } catch {
    console.error(`JSON として解釈できません: ${jsonPath}`);
    process.exit(1);
  }
  try {
    assertSupportedExport(data);
  } catch (e) {
    if (e instanceof UnsupportedExportVersionError) {
      console.error(`対応していない JSON の版です: ${String(e.version)}（対応: 1）`);
      process.exit(1);
    }
    throw e;
  }
  if (!Array.isArray(data.entries)) {
    console.error(`JSON に entries がありません: ${jsonPath}`);
    process.exit(1);
  }
  return data;
}

function printSource(data: OccurrenceExport): void {
  const owner = data.occurrence.owner;
  const numbers = data.entries.map((e) => e.occurrenceNumber);
  console.log("エクスポート元:");
  console.log(`  掲載箇所        : "${data.occurrence.location}"`);
  console.log(
    `  所有ユーザー    : ${owner.name} <${owner.email}>${owner.isSystem ? " (system)" : ""}`,
  );
  console.log(`  単語数          : ${data.entries.length}`);
  console.log(`  掲載番号        : ${formatOccurrenceNumberRanges(numbers)}`);
  console.log(`  書き出し日時    : ${data.exportedAt}`);
}

function printReport(report: SyncReport): void {
  const t = report.target;
  console.log("\n反映先:");
  console.log(
    `  ユーザー        : ${t.ownerName} <${t.ownerEmail}>${t.isSystem ? " (system)" : ""}`,
  );
  console.log(
    `  掲載箇所        : "${t.location}"${t.occurrenceCreated ? (report.executed ? "（新規作成した）" : "（新規作成する）") : ""}`,
  );

  const byAction = { replaced: 0, linked: 0, created: 0 };
  let keptAudio = 0;
  for (const r of report.results) {
    byAction[r.action] += 1;
    keptAudio += r.keptAudio;
  }
  console.log("\n結果:");
  console.log(`  対象の掲載番号  : ${report.totalEntries}`);
  console.log(`  ${ACTION_LABEL.replaced}      : ${byAction.replaced}`);
  console.log(`  ${ACTION_LABEL.created}      : ${byAction.created}`);
  console.log(`  ${ACTION_LABEL.linked}: ${byAction.linked}`);
  console.log(`  ${report.executed ? "引き継いだ発音音源" : "引き継ぐ発音音源"}: ${keptAudio}`);
  console.log(`  スキップ        : ${report.skipped.length}`);

  if (report.skipped.length > 0) {
    const byReason = new Map<SyncSkipReason, string[]>();
    for (const s of report.skipped) {
      const list = byReason.get(s.reason) ?? [];
      list.push(`No.${s.occurrenceNumber} ${s.headword} — ${s.detail}`);
      byReason.set(s.reason, list);
    }
    for (const [reason, lines] of byReason) {
      console.log(`  ${REASON_LABEL[reason]}: ${lines.length} 件`);
      printSample(lines);
    }
  }

  if (report.unresolvedLinks.length > 0) {
    console.log(`  関連語リンクの未解決: ${report.unresolvedLinks.length} 件（リンク無しで登録）`);
    printSample(
      report.unresolvedLinks.map(
        (u) => `No.${u.occurrenceNumber} ${u.headword} → "${u.linkedHeadword}" が反映先に無い`,
      ),
    );
  }

  // 中身がどう変わるかは件数の増減で見る（先頭のみ。全件は多すぎる）。
  const changed = report.results.filter(
    (r) =>
      r.before.meanings !== r.after.meanings ||
      r.before.examples !== r.after.examples ||
      r.before.related !== r.after.related ||
      r.before.memos !== r.after.memos,
  );
  if (changed.length > 0) {
    console.log(`  件数が変わる単語: ${changed.length}`);
    printSample(
      changed.map(
        (r) =>
          `No.${r.occurrenceNumber} ${r.headword}: ` +
          `意味 ${r.before.meanings}→${r.after.meanings} / 例文 ${r.before.examples}→${r.after.examples} / ` +
          `関連語 ${r.before.related}→${r.after.related} / メモ ${r.before.memos}→${r.after.memos}`,
      ),
    );
  }
}

type Target = { ownerId: string; location: string };

/** 対話: 反映先ユーザー → 反映先掲載箇所 → レンジ を順に選ばせる。 */
async function chooseTarget(
  prisma: PrismaClient,
  rl: ReturnType<typeof createInterface>,
  data: OccurrenceExport,
): Promise<{ target: Target; numbers?: number[] } | null> {
  const owners = await listImportOwners(prisma);
  if (owners.length === 0) {
    console.error("ユーザーがいません。`pnpm db:seed` を実行してください。");
    return null;
  }
  const defaultOwnerIndex = Math.max(
    0,
    owners.findIndex((o) => o.ownerEmail === data.occurrence.owner.email),
  );

  console.log("\n反映先ユーザー:");
  const ownerWidth = String(owners.length).length;
  owners.forEach((o, i) => {
    const mark = i === defaultOwnerIndex ? " ←既定" : "";
    console.log(
      `  [${String(i + 1).padStart(ownerWidth)}] ${o.ownerName} <${o.ownerEmail}>${o.isSystem ? " (system)" : ""}${mark}`,
    );
  });
  const ownerAns = (
    await rl.question(`\n番号を入力（空 Enter で ${defaultOwnerIndex + 1}、q で中止）: `)
  ).trim();
  if (ownerAns.toLowerCase() === "q") return null;
  const ownerIdx = ownerAns === "" ? defaultOwnerIndex + 1 : Number(ownerAns);
  if (!Number.isInteger(ownerIdx) || ownerIdx < 1 || ownerIdx > owners.length) {
    console.error("不正な番号です。中止します。");
    return null;
  }
  const owner = owners[ownerIdx - 1]!;

  const occurrences = (await listOccurrences(prisma)).filter((o) => o.ownerId === owner.ownerId);
  const sameNameIndex = occurrences.findIndex((o) => o.location === data.occurrence.location);
  // 同名が既にあるなら「新規作成」は選ばせない（掲載箇所名は所有者内で一意）。
  const newIndex = sameNameIndex >= 0 ? null : occurrences.length + 1;
  const maxIndex = newIndex ?? occurrences.length;
  if (maxIndex === 0) {
    console.error("反映先の掲載箇所がありません。中止します。");
    return null;
  }

  console.log(`\n反映先の掲載箇所（${owner.ownerName} <${owner.ownerEmail}> 所有）:`);
  const occWidth = String(maxIndex).length;
  occurrences.forEach((o, i) => {
    const mark = i === sameNameIndex ? " ←既定（JSON と同名）" : "";
    console.log(`  [${String(i + 1).padStart(occWidth)}] ${o.location}  (単語=${o.words})${mark}`);
  });
  if (newIndex !== null) {
    console.log(
      `  [${String(newIndex).padStart(occWidth)}] 新規作成: "${data.occurrence.location}" ←既定`,
    );
  }
  const defaultOccIndex = sameNameIndex >= 0 ? sameNameIndex + 1 : newIndex!;

  const occAns = (
    await rl.question(`\n番号を入力（空 Enter で ${defaultOccIndex}、q で中止）: `)
  ).trim();
  if (occAns.toLowerCase() === "q") return null;
  const occIdx = occAns === "" ? defaultOccIndex : Number(occAns);
  if (!Number.isInteger(occIdx) || occIdx < 1 || occIdx > maxIndex) {
    console.error("不正な番号です。中止します。");
    return null;
  }
  const location =
    occIdx === newIndex ? data.occurrence.location : occurrences[occIdx - 1]!.location;

  const rangeInput = (await rl.question("\n掲載番号のレンジ（空 Enter で JSON の全件）: ")).trim();
  let numbers: number[] | undefined;
  if (rangeInput !== "") {
    try {
      numbers = parseOccurrenceNumberRanges(rangeInput);
    } catch (e) {
      if (e instanceof InvalidNumberRangeError) {
        console.error(`レンジ指定が不正です: ${e.reason}`);
        return null;
      }
      throw e;
    }
  }

  return { target: { ownerId: owner.ownerId, location }, numbers };
}

async function runInteractive(prisma: PrismaClient, data: OccurrenceExport): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const chosen = await chooseTarget(prisma, rl, data);
    if (!chosen) {
      console.log("中止しました。");
      process.exitCode = 1;
      return;
    }

    const preview = await syncOccurrence(
      prisma,
      data,
      { ...chosen.target, numbers: chosen.numbers },
      { dryRun: true },
    );
    printReport(preview);

    const mode = (
      await rl.question("\nモードを選択 [1] ドライランのみ(終了) / [2] 実反映 : ")
    ).trim();
    if (mode !== "2") {
      console.log("\n[dry-run] 変更はありません。");
      return;
    }

    const report = await syncOccurrence(
      prisma,
      data,
      { ...chosen.target, numbers: chosen.numbers },
      { dryRun: false },
    );
    printReport(report);
    console.log("\n✓ 反映しました。");
  } finally {
    rl.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  let email: string | undefined;
  let location: string | undefined;
  let execute = false;
  for (const arg of argv) {
    if (arg === "--execute") execute = true;
    else if (arg.startsWith("--email=")) email = arg.slice("--email=".length);
    else if (arg.startsWith("--location=")) location = arg.slice("--location=".length);
    else if (arg.startsWith("--")) {
      console.error(`不明なオプション: ${arg}`);
      usage();
    } else positional.push(arg);
  }
  const [jsonPath, ranges] = positional;
  if (!jsonPath || positional.length > 2) usage();

  const connectionString =
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_URL_UNPOOLED"] ??
    process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("DATABASE_URL / DATABASE_URL_UNPOOLED / DIRECT_URL is not set");
    process.exit(1);
  }
  // 反映は手元の DB 専用。リモートに向いていたら何もせず落とす（本番へ書き戻さないため）。
  if (!isLocalDatabaseUrl(connectionString)) {
    const host = (() => {
      try {
        return new URL(connectionString).hostname;
      } catch {
        return "(unparsable)";
      }
    })();
    console.error(`反映先がローカル DB ではありません（host=${host}）。中止します。`);
    console.error("  このツールはローカル DB 専用です。本番へ書き戻す用途では使えません。");
    process.exit(1);
  }

  const data = readExport(jsonPath);
  printSource(data);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    if (!ranges && !email && !location && !execute) {
      if (!stdin.isTTY) {
        console.error("\n対話モードには TTY が必要です。--execute 等の引数を指定してください。");
        usage();
      }
      await runInteractive(prisma, data);
      return;
    }

    const owner = await resolveImportOwner(prisma, email);
    const numbers = ranges ? parseOccurrenceNumberRanges(ranges) : undefined;
    const report = await syncOccurrence(
      prisma,
      data,
      {
        ownerId: owner.ownerId,
        location: location ?? data.occurrence.location,
        numbers,
      },
      { dryRun: !execute },
    );
    printReport(report);
    console.log(
      report.executed
        ? "\n✓ 反映しました。"
        : "\n[dry-run] 変更はありません。反映するには --execute を付けて再実行してください。",
    );
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
    if (e instanceof OccurrenceLocationConflictError) {
      console.error(
        `掲載箇所名「${e.location}」は既に使われています（system または本人の掲載箇所）。` +
          " --location で別名を指定してください。",
      );
      process.exit(1);
    }
    if (e instanceof UnsupportedExportVersionError) {
      console.error(`対応していない JSON の版です: ${String(e.version)}`);
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
