// 既存の掲載箇所に登録済みの単語へ、関連語（RelatedWord）を CSV から一括登録する運用ロジック。
// 単語登録（bulk-word-import）の後に走らせる前提で、リンク先は掲載番号（WordOccurrence.occurrenceNumber）
// で解決する。tsx から呼べるよう prisma は引数注入、`server-only` や `@/` 実行時 import を持たない。

import { resolveImportOwner } from "./import-owner";

import type { RelatedWordKind } from "@/lib/mock/related-word-kinds";

import type { PrismaClient } from "@/generated/prisma/client";

// owner 解決系のエラーは import-owner に集約。CLI のメッセージ分岐のため re-export する。
export { SystemUserMissingError, UserNotFoundByEmailError } from "./import-owner";

/** CSV 1 行を前処理した投入単位。kind は enum キー、空欄は null に正規化済み。 */
export type RelatedImportRow = {
  headword: string; // 親単語（この語の意味欄に書かれていた関連語）
  kind: RelatedWordKind;
  term: string;
  meaning: string | null;
  linkNumber: number | null; // ⇒ N の掲載番号。無ければ null
};

/** email 省略（undefined）= system ユーザー宛て。location は単語を登録した掲載箇所名。 */
export type RelatedImportInput = { email?: string; location: string };

export type RelatedSkip = { headword: string; term: string; reason: "word_not_found" };

export type RelatedUnresolvedLink = {
  headword: string;
  term: string;
  linkNumber: number;
  reason: "out_of_range" | "target_not_found";
};

export type RelatedImportReport = {
  location: string;
  ownerId: string;
  ownerEmail: string;
  isSystem: boolean;
  occurrenceId: string;
  totalRows: number;
  willCreate: number; // 作成（予定）関連語数（親 word が見つかった行）
  created: number; // 実際に作成した数（dry-run は 0）
  linksResolved: number; // linkedWordId を解決した（予定）数
  unresolvedLinks: RelatedUnresolvedLink[];
  skipped: RelatedSkip[];
  executed: boolean;
};

export class OccurrenceNotFoundError extends Error {
  constructor(public readonly location: string) {
    super(`OCCURRENCE_NOT_FOUND: ${location}`);
    this.name = "OccurrenceNotFoundError";
  }
}

type PlannedRelated = {
  wordId: string;
  kind: RelatedWordKind;
  term: string;
  meaning: string | null;
  sortOrder: number;
  linkedWordId: string | null;
};

export async function importRelatedWords(
  prisma: PrismaClient,
  input: RelatedImportInput,
  rows: RelatedImportRow[],
  opts: { dryRun: boolean },
): Promise<RelatedImportReport> {
  const { ownerId, ownerEmail, isSystem } = await resolveImportOwner(prisma, input.email);
  const location = input.location.trim();

  const occurrence = await prisma.occurrence.findFirst({
    where: { ownerId, location },
    select: { id: true },
  });
  if (!occurrence) throw new OccurrenceNotFoundError(location);
  const occurrenceId = occurrence.id;

  // 掲載番号 → wordId（この掲載箇所の WordOccurrence から構築）。最大番号は範囲外判定に使う。
  const occLinks = await prisma.wordOccurrence.findMany({
    where: { occurrenceId },
    select: { occurrenceNumber: true, wordId: true },
  });
  const numberToWordId = new Map<number, string>();
  let maxNumber = 0;
  for (const l of occLinks) {
    if (l.occurrenceNumber === null) continue;
    numberToWordId.set(l.occurrenceNumber, l.wordId);
    if (l.occurrenceNumber > maxNumber) maxNumber = l.occurrenceNumber;
  }

  // headword → wordId（owner 所有の単語）。
  const headwords = [...new Set(rows.map((r) => r.headword))];
  const words = await prisma.word.findMany({
    where: { ownerId, headword: { in: headwords } },
    select: { id: true, headword: true },
  });
  const headwordToWordId = new Map(words.map((w) => [w.headword, w.id]));

  const skipped: RelatedSkip[] = [];
  const unresolvedLinks: RelatedUnresolvedLink[] = [];
  const plans: PlannedRelated[] = [];
  const sortCounter = new Map<string, number>(); // wordId → 次の sortOrder

  for (const row of rows) {
    const wordId = headwordToWordId.get(row.headword);
    if (!wordId) {
      skipped.push({ headword: row.headword, term: row.term, reason: "word_not_found" });
      continue;
    }
    let linkedWordId: string | null = null;
    if (row.linkNumber !== null) {
      const target = numberToWordId.get(row.linkNumber);
      if (target) {
        linkedWordId = target;
      } else {
        unresolvedLinks.push({
          headword: row.headword,
          term: row.term,
          linkNumber: row.linkNumber,
          reason: row.linkNumber > maxNumber ? "out_of_range" : "target_not_found",
        });
      }
    }
    const sortOrder = sortCounter.get(wordId) ?? 0;
    sortCounter.set(wordId, sortOrder + 1);
    plans.push({
      wordId,
      kind: row.kind,
      term: row.term,
      meaning: row.meaning,
      sortOrder,
      linkedWordId,
    });
  }

  const base = {
    location,
    ownerId,
    ownerEmail,
    isSystem,
    occurrenceId,
    totalRows: rows.length,
    willCreate: plans.length,
    unresolvedLinks,
    skipped,
  } satisfies Partial<RelatedImportReport>;

  if (opts.dryRun) {
    const linksResolved = plans.filter((p) => p.linkedWordId !== null).length;
    return { ...base, created: 0, linksResolved, executed: false };
  }

  // 件数は小さい（~183）が、既存 bulk と同じく 1 件ずつ create（best-effort）。
  let created = 0;
  let linksResolved = 0;
  for (const p of plans) {
    await prisma.relatedWord.create({
      data: {
        wordId: p.wordId,
        ownerId,
        kind: p.kind,
        term: p.term,
        meaning: p.meaning,
        sortOrder: p.sortOrder,
        linkedWordId: p.linkedWordId,
      },
      select: { id: true },
    });
    created += 1;
    if (p.linkedWordId !== null) linksResolved += 1;
  }

  return { ...base, created, linksResolved, executed: true };
}
