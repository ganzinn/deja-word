// 掲載箇所（Occurrence）を新規作成し、CSV 由来の英単語・意味（Meaning / MeaningText）を
// まとめて登録する運用ロジック。email 未指定なら system ユーザー所有（共有マスタ）として登録する。
//
// tsx の運用スクリプトからも呼べるよう、prisma は引数注入とし、`server-only` や prisma シングルトン、
// `@/` の実行時 import を持たない（PrismaClient は type-only import、値は相対 import のみ）。
// 単語登録の正規パス（createWordForUser）は server-only + @/ 依存で tsx から呼べないため、
// prisma/seed.ts の seedSystemWord と同じ「skip 重複・マージなし」のネスト create で構成する。

import { SYSTEM_USER_ID, scopedOwnerIds } from "./system-user";

import type { PrismaClient } from "@/generated/prisma/client";

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

export class UserNotFoundByEmailError extends Error {
  constructor(public readonly email: string) {
    super(`USER_NOT_FOUND: ${email}`);
    this.name = "UserNotFoundByEmailError";
  }
}

export class SystemUserMissingError extends Error {
  constructor() {
    super("SYSTEM_USER_MISSING");
    this.name = "SystemUserMissingError";
  }
}

export class DuplicateOccurrenceLocationError extends Error {
  constructor(public readonly location: string) {
    super(`DUPLICATE_OCCURRENCE_LOCATION: ${location}`);
    this.name = "DuplicateOccurrenceLocationError";
  }
}

type ResolvedOwner = { ownerId: string; ownerEmail: string; isSystem: boolean };

async function resolveOwner(
  prisma: PrismaClient,
  email: string | undefined,
): Promise<ResolvedOwner> {
  if (!email) {
    const sys = await prisma.user.findUnique({
      where: { id: SYSTEM_USER_ID },
      select: { email: true },
    });
    if (!sys) throw new SystemUserMissingError();
    return { ownerId: SYSTEM_USER_ID, ownerEmail: sys.email, isSystem: true };
  }
  const normalized = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true },
  });
  if (!user) throw new UserNotFoundByEmailError(normalized);
  return { ownerId: user.id, ownerEmail: user.email, isSystem: false };
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
  const { ownerId, ownerEmail, isSystem } = await resolveOwner(prisma, input.email);
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
    const presetSettings = isSystem ? await prisma.user.count() : 1;
    return { ...base, occurrenceId: null, presetSettings, created: 0, executed: false };
  }

  // 掲載箇所 + プリセット設定はまとめて作る（system は全ユーザー、個人は本人のみ）。
  // sortOrder は createOccurrenceForUser と同様に既定（0）のままにし、一覧は createdAt で並ぶ。
  const { occurrenceId, presetSettings } = await prisma.$transaction(async (tx) => {
    const occ = await tx.occurrence.create({
      data: { ownerId, location, autoNumbering: true },
      select: { id: true },
    });
    let presets: number;
    if (isSystem) {
      const users = await tx.user.findMany({ select: { id: true } });
      const res = await tx.occurrencePresetSetting.createMany({
        data: users.map((u) => ({ userId: u.id, occurrenceId: occ.id })),
        skipDuplicates: true,
      });
      presets = res.count;
    } else {
      await tx.occurrencePresetSetting.create({ data: { userId: ownerId, occurrenceId: occ.id } });
      presets = 1;
    }
    return { occurrenceId: occ.id, presetSettings: presets };
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
