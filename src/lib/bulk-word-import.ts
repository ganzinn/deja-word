// 掲載箇所（Occurrence）を新規作成し、CSV 由来の英単語・意味（Meaning / MeaningText）を
// まとめて登録する運用ロジック。email 未指定なら system ユーザー所有（共有マスタ）として登録する。
//
// tsx の運用スクリプトからも呼べるよう、prisma は引数注入とし、`server-only` や prisma シングルトン、
// `@/` の実行時 import を持たない（PrismaClient は type-only import、値は相対 import のみ）。
// 単語登録の正規パス（createWordForUser）は server-only + @/ 依存で tsx から呼べないため、
// prisma/seed.ts の seedSystemWord と同じ「skip 重複・マージなし」のネスト create で構成する。

import { resolveImportOwner } from "./import-owner";
import { scopedOwnerIds } from "./system-user";

import type { PrismaClient } from "@/generated/prisma/client";

// owner 解決系は import-owner に集約。既存の import 元（scripts / tests）の互換のため re-export する。
export {
  resolveImportOwner,
  SystemUserMissingError,
  UserNotFoundByEmailError,
} from "./import-owner";

/** CSV 1 行を前処理した投入単位。区切り適用・trim・空除去は呼び出し側（スクリプト）で済ませる。 */
export type BulkImportRow = {
  headword: string;
  partOfSpeech: string | null;
  meaningTexts: string[];
};

/** email 省略（undefined）= system ユーザー宛て。 */
export type BulkImportInput = {
  email?: string;
  location: string;
};

export type SkipReason = "duplicate" | "duplicate_in_csv" | "no_meaning";

export type BulkImportReport = {
  occurrenceId: string | null; // dry-run では null
  location: string;
  ownerId: string; // "system" or 指定ユーザーの id
  ownerEmail: string;
  isSystem: boolean;
  presetSettings: number; // 付与した（dry-run では付与予定の）プリセット設定数
  totalRows: number;
  willCreate: number; // 登録（予定）単語数
  created: number; // 実際に登録した単語数（dry-run は 0）
  skipped: { headword: string; reason: SkipReason }[];
  executed: boolean;
};

export class DuplicateOccurrenceLocationError extends Error {
  constructor(public readonly location: string) {
    super(`DUPLICATE_OCCURRENCE_LOCATION: ${location}`);
    this.name = "DuplicateOccurrenceLocationError";
  }
}

/** スキップ対象を仕分けし、登録すべき行だけを返す。 */
function planRows(
  rows: BulkImportRow[],
  existingHeadwords: Set<string>,
): { toCreate: BulkImportRow[]; skipped: BulkImportReport["skipped"] } {
  const seen = new Set<string>();
  const skipped: BulkImportReport["skipped"] = [];
  const toCreate: BulkImportRow[] = [];
  for (const row of rows) {
    if (row.meaningTexts.length === 0) {
      skipped.push({ headword: row.headword, reason: "no_meaning" });
      continue;
    }
    if (existingHeadwords.has(row.headword)) {
      skipped.push({ headword: row.headword, reason: "duplicate" });
      continue;
    }
    if (seen.has(row.headword)) {
      skipped.push({ headword: row.headword, reason: "duplicate_in_csv" });
      continue;
    }
    seen.add(row.headword);
    toCreate.push(row);
  }
  return { toCreate, skipped };
}

export async function bulkImportWords(
  prisma: PrismaClient,
  input: BulkImportInput,
  rows: BulkImportRow[],
  opts: { dryRun: boolean },
): Promise<BulkImportReport> {
  const { ownerId, ownerEmail, isSystem } = await resolveImportOwner(prisma, input.email);
  const location = input.location.trim();

  // 掲載箇所名の衝突チェック（createOccurrenceForUser と同義のスコープ判定）。
  const conflict = await prisma.occurrence.findFirst({
    where: { ownerId: { in: scopedOwnerIds(ownerId) }, location },
    select: { id: true },
  });
  if (conflict) throw new DuplicateOccurrenceLocationError(location);

  // 既存 headword を 1 クエリで取得して重複 skip 判定に使う（マージはしない）。
  const existing = await prisma.word.findMany({
    where: { ownerId, headword: { in: rows.map((r) => r.headword) } },
    select: { headword: true },
  });
  const existingHeadwords = new Set(existing.map((w) => w.headword));
  const { toCreate, skipped } = planRows(rows, existingHeadwords);

  const base = {
    location,
    ownerId,
    ownerEmail,
    isSystem,
    totalRows: rows.length,
    willCreate: toCreate.length,
    skipped,
  } satisfies Partial<BulkImportReport>;

  if (opts.dryRun) {
    return { ...base, occurrenceId: null, presetSettings: 1, created: 0, executed: false };
  }

  // 掲載箇所 + プリセット設定はまとめて作る。共通掲載箇所はオプトイン方式のため、
  // system 取り込みでも他ユーザーへは付与せず、掲載箇所オーナー本人ぶんのみ ON にする
  // （他ユーザーは設定画面で各自 ON にする）。
  // sortOrder は createOccurrenceForUser と同様に既定（0）のままにし、一覧は createdAt で並ぶ。
  const { occurrenceId, presetSettings } = await prisma.$transaction(async (tx) => {
    const occ = await tx.occurrence.create({
      data: { ownerId, location, autoNumbering: true },
      select: { id: true },
    });
    await tx.occurrencePresetSetting.create({ data: { userId: ownerId, occurrenceId: occ.id } });
    return { occurrenceId: occ.id, presetSettings: 1 };
  });

  // 各単語は 1 件ずつネスト create（単一呼び出しで原子的）。掲載番号は登録順に 1,2,3…。
  let created = 0;
  for (const row of toCreate) {
    const occurrenceNumber = created + 1;
    await prisma.word.create({
      data: {
        ownerId,
        headword: row.headword,
        meanings: {
          create: [
            {
              ownerId,
              partOfSpeech: row.partOfSpeech,
              sortOrder: 0,
              texts: {
                createMany: {
                  data: row.meaningTexts.map((text, j) => ({ ownerId, text, sortOrder: j })),
                },
              },
            },
          ],
        },
        wordOccurrences: {
          create: { occurrenceId, ownerId, sortOrder: 0, occurrenceNumber },
        },
      },
      select: { id: true },
    });
    created += 1;
  }

  return { ...base, occurrenceId, presetSettings, created, executed: true };
}
