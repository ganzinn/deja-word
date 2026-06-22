// 【使い捨て】vivid treasure「ターゲット1900」の元 CSV（tmp/target1900.csv）を、取り込み用の 2 ファイルに分解する。
//   - <out>.words.csv   : headword,part_of_speech,meaning_text（関連語注記を除去・意味は ; 連結）
//                         → 既存 `pnpm db:import-words` でそのまま取り込める
//   - <out>.related.csv : headword,kind,term,meaning,link_number（関連語 1 件＝1 行）
//                         → 人手レビュー後、`pnpm db:import-related-words` で取り込む
//
// この本特有の埋め込み記法をパースする一回限りのスクリプト。文法は src/lib/meaning-text-parser.ts を参照。
//
// Usage:
//   pnpm tsx scripts/split-target1900.ts [<inputCsv>] [<outPrefix>]
//     既定: 入力 tmp/target1900.csv / 出力 tmp/target1900.words.csv, tmp/target1900.related.csv
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { parseMeaningText } from "../src/lib/meaning-text-parser";

const EXPECTED_HEADER = ["headword", "part_of_speech", "meaning_text"];
const MAX_LISTING = 1900;

function csvCell(value: string): string {
  return /["\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function csvLine(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

function main(): void {
  const inputPath = process.argv[2] ?? "tmp/target1900.csv";
  const outPrefix = process.argv[3] ?? inputPath.replace(/\.csv$/i, "");
  const wordsPath = `${outPrefix}.words.csv`;
  const relatedPath = `${outPrefix}.related.csv`;

  const records = parse(readFileSync(inputPath, "utf8"), {
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];

  const header = (records[0] ?? []).map((h) => h.trim());
  if (EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    console.error(
      `CSV ヘッダは ${EXPECTED_HEADER.join(",")} である必要があります。実際: ${header.join(",")}`,
    );
    process.exit(1);
  }

  const wordLines = [EXPECTED_HEADER.join(",")];
  const relatedLines = ["headword,kind,term,meaning,link_number"];

  let wordCount = 0;
  let relatedCount = 0;
  let linkCount = 0;
  let regionLabelCount = 0;
  const warnings: string[] = [];

  for (let i = 1; i < records.length; i++) {
    const rec = records[i] ?? [];
    const headword = (rec[0] ?? "").trim();
    if (headword === "") continue;
    const partOfSpeech = (rec[1] ?? "").trim();
    // 引用符なしで meaning_text 内にカンマがあっても拾えるよう 3 列目以降を結合（import-words と同方針）。
    const meaningTextRaw = rec.slice(2).join(",");

    const { meaningTexts, relatedWords } = parseMeaningText(meaningTextRaw);
    wordLines.push(csvLine([headword, partOfSpeech, meaningTexts.join(";")]));
    wordCount += 1;
    if (meaningTexts.length === 0) warnings.push(`#${i} ${headword}: 意味本文が空`);

    for (const rw of relatedWords) {
      relatedLines.push(
        csvLine([
          headword,
          rw.kind,
          rw.term,
          rw.meaning ?? "",
          rw.linkNumber === null ? "" : String(rw.linkNumber),
        ]),
      );
      relatedCount += 1;
      if (rw.term === "") warnings.push(`#${i} ${headword}: 関連語の term が空`);
      if (rw.term.includes("【")) regionLabelCount += 1;
      if (rw.linkNumber !== null) {
        linkCount += 1;
        if (rw.linkNumber < 1 || rw.linkNumber > MAX_LISTING) {
          warnings.push(`#${i} ${headword}: 掲載番号 ${rw.linkNumber} が範囲外（${rw.term}）`);
        }
      }
    }
  }

  writeFileSync(wordsPath, `${wordLines.join("\n")}\n`);
  writeFileSync(relatedPath, `${relatedLines.join("\n")}\n`);

  console.log(`単語 (words.csv)        : ${wordCount} 行 → ${wordsPath}`);
  console.log(`関連語 (related.csv)    : ${relatedCount} 行 → ${relatedPath}`);
  console.log(`  うちリンク有り        : ${linkCount}`);
  console.log(`  うち地域ラベル        : ${regionLabelCount}`);
  if (warnings.length > 0) {
    console.log(`警告 (${warnings.length} 件):`);
    for (const w of warnings) console.log(`  - ${w}`);
  } else {
    console.log("警告なし。");
  }
  console.log(
    "\n→ related.csv を目視レビューしてから db:import-related-words で取り込んでください。",
  );
}

main();
