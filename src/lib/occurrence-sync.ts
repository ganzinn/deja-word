// 掲載箇所（Occurrence）配下の単語コンテンツを、DB をまたいで移すための
// エクスポート（読み取り）と反映（書き込み）のコアロジック。
//
// 用途は「別環境（本番など）で育った意味・例文・関連語・メモを手元の DB へ持ってくる」こと。
// 2 つの DB へ同時に接続せず、中間 JSON（OccurrenceExport）を挟む 2 段構成にしてある。
// エクスポート側は読み取り専用、反映側は書き込み専用で、互いの接続先を知らない。
//
// tsx の運用スクリプトから呼べるよう、prisma は引数注入とし、`server-only` や
// `@/` の実行時 import を持たない（PrismaClient / enum は type-only import）。
// 取り込みは単語 1 件 = 1 トランザクションの非原子方式（bulk-word-import と同方針。
// リモート DB への往復が長いため長大トランザクションを避ける）。
//
// ■ 発音音源は同期しない
//   音源の実体は環境ごとに別（本番 = Vercel Blob の絶対 URL / dev = ローカルディスクの
//   相対 key）で、URL をそのまま持ち込むと解決できない行になる。エクスポートには参考として
//   URL を含めるが、反映側は常に無視し、置き換え前に**反映先の URL を退避して付け直す**。
//
// ■ 掲載番号（occurrenceNumber）が突合キー
//   DB をまたぐと id は一致しないため、単語は掲載番号で突合し、関連語の内部リンクは
//   見出し語（linkedHeadword）で引き直す。掲載番号を持たない単語は対象外。

import { SYSTEM_USER_ID, scopedOwnerIds } from "./system-user";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ExampleKind, RelatedKind } from "@/generated/prisma/enums";

/** 中間 JSON のスキーマ版。反映側は一致しないものを受け付けない。 */
export const OCCURRENCE_EXPORT_VERSION = 1;

/** 掲載番号レンジ 1 回の指定で展開を許す上限（打ち間違いでの暴走防止）。 */
const MAX_RANGE_SIZE = 100_000;

/** 1 クエリで詳細を読み込む単語リンク数。全件が大きい掲載箇所でも一定に保つ。 */
const EXPORT_CHUNK_SIZE = 200;

// --- 中間 JSON の型 ----------------------------------------------------------

export type ExportedNote = { text: string; sortOrder: number };
export type ExportedDetail = { detail: string; sortOrder: number };

export type ExportedMeaning = {
  partOfSpeech: string | null;
  pronunciation: string | null;
  sortOrder: number;
  /** 参考情報。反映側は使わない（→ ファイル冒頭「発音音源は同期しない」）。 */
  pronunciationAudioUrl: string | null;
  texts: ExportedNote[];
  notes: ExportedNote[];
};

export type ExportedExample = {
  kind: ExampleKind;
  text: string;
  meaning: string | null;
  sortOrder: number;
  /** 参考情報。反映側は使わない。 */
  pronunciationAudioUrl: string | null;
  notes: ExportedNote[];
};

export type ExportedRelatedWord = {
  kind: RelatedKind | null;
  term: string;
  partOfSpeech: string | null;
  pronunciation: string | null;
  meaning: string | null;
  sortOrder: number;
  /** 内部リンク先の見出し語。id は DB をまたぐと一致しないため見出し語で持つ。 */
  linkedHeadword: string | null;
  /** 参考情報。反映側は使わない。 */
  pronunciationAudioUrl: string | null;
  notes: ExportedNote[];
};

export type ExportedWord = {
  occurrenceNumber: number;
  headword: string;
  /** 見出し語の作成日時（ISO 8601）。新規作成時のみ引き継ぐ（一覧の新着順を揃えるため）。 */
  createdAt: string;
  /** WordOccurrence.sortOrder。 */
  sortOrder: number;
  details: ExportedDetail[];
  meanings: ExportedMeaning[];
  examples: ExportedExample[];
  related: ExportedRelatedWord[];
  memos: ExportedNote[];
};

export type OccurrenceExport = {
  version: number;
  exportedAt: string;
  occurrence: {
    location: string;
    autoNumbering: boolean;
    owner: { name: string; email: string; isSystem: boolean };
  };
  entries: ExportedWord[];
};

// --- エラー ------------------------------------------------------------------

export class InvalidNumberRangeError extends Error {
  constructor(
    public readonly spec: string,
    public readonly reason: string,
  ) {
    super(`INVALID_NUMBER_RANGE: ${reason}`);
    this.name = "InvalidNumberRangeError";
  }
}

export class OccurrenceNotFoundError extends Error {
  constructor(public readonly occurrenceId: string) {
    super(`OCCURRENCE_NOT_FOUND: ${occurrenceId}`);
    this.name = "OccurrenceNotFoundError";
  }
}

/** 反映先に掲載箇所を新規作成しようとしたが、scoped に同名が既にある。 */
export class OccurrenceLocationConflictError extends Error {
  constructor(public readonly location: string) {
    super(`OCCURRENCE_LOCATION_CONFLICT: ${location}`);
    this.name = "OccurrenceLocationConflictError";
  }
}

export class UnsupportedExportVersionError extends Error {
  constructor(public readonly version: unknown) {
    super(`UNSUPPORTED_EXPORT_VERSION: ${String(version)}`);
    this.name = "UnsupportedExportVersionError";
  }
}

// --- 掲載番号レンジ ----------------------------------------------------------

/**
 * `"1-100,1581-1600"` / `"7"` 形式を掲載番号の配列（昇順・重複排除）に展開する。
 * 空文字は「指定なし（全件）」ではなくエラーにする（呼び出し側が省略で表現する）。
 */
export function parseOccurrenceNumberRanges(spec: string): number[] {
  const trimmed = spec.trim();
  if (trimmed === "") throw new InvalidNumberRangeError(spec, "レンジが空です");

  const numbers = new Set<number>();
  for (const part of trimmed.split(",")) {
    const token = part.trim();
    if (token === "") {
      throw new InvalidNumberRangeError(spec, `"${trimmed}" に空の区切りがあります`);
    }
    const matched = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!matched) {
      throw new InvalidNumberRangeError(
        spec,
        `"${token}" は掲載番号（例 7）でも範囲（例 1-100）でもありません`,
      );
    }
    const from = Number(matched[1]);
    const to = matched[2] === undefined ? from : Number(matched[2]);
    if (from < 1) throw new InvalidNumberRangeError(spec, `"${token}" の掲載番号は 1 以上です`);
    if (from > to) {
      throw new InvalidNumberRangeError(spec, `"${token}" は 開始 <= 終了 で指定してください`);
    }
    if (to - from + 1 > MAX_RANGE_SIZE) {
      throw new InvalidNumberRangeError(
        spec,
        `"${token}" の範囲が広すぎます（上限 ${MAX_RANGE_SIZE}）`,
      );
    }
    for (let n = from; n <= to; n++) numbers.add(n);
  }
  if (numbers.size > MAX_RANGE_SIZE) {
    throw new InvalidNumberRangeError(
      spec,
      `合計の掲載番号数が多すぎます（上限 ${MAX_RANGE_SIZE}）`,
    );
  }
  return [...numbers].sort((a, b) => a - b);
}

/** 掲載番号の配列を `"1-100,1581-1600"` 形式に畳んで表示用に整形する（parse の逆）。 */
export function formatOccurrenceNumberRanges(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (sorted.length === 0) return "(なし)";
  const parts: string[] = [];
  let start = sorted[0]!;
  let prev = start;
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(",");
}

// --- エクスポート（読み取り専用） --------------------------------------------

export type ExportReport = {
  data: OccurrenceExport;
  /** 掲載箇所に紐づく全リンク数（掲載番号なしを含む）。 */
  totalLinks: number;
  /** 掲載番号が無いため対象外にしたリンク数。 */
  withoutNumber: number;
  /** レンジ指定した掲載番号の数。null = 指定なし（全件）。 */
  requestedCount: number | null;
  /** 指定したのに掲載箇所に存在しなかった掲載番号。 */
  missingNumbers: number[];
};

const NOTE_SELECT = {
  orderBy: { sortOrder: "asc" },
  select: { text: true, sortOrder: true },
} as const;

/**
 * 掲載箇所配下の単語コンテンツを中間 JSON に書き出す。**読み取りしか行わない**。
 * `numbers` を渡すとその掲載番号だけに絞る（省略で掲載番号を持つ全単語）。
 */
export async function exportOccurrence(
  prisma: PrismaClient,
  input: { occurrenceId: string; numbers?: number[] },
): Promise<ExportReport> {
  const occurrence = await prisma.occurrence.findUnique({
    where: { id: input.occurrenceId },
    select: {
      location: true,
      autoNumbering: true,
      ownerId: true,
      owner: { select: { name: true, email: true } },
    },
  });
  if (!occurrence) throw new OccurrenceNotFoundError(input.occurrenceId);

  const allLinks = await prisma.wordOccurrence.findMany({
    where: { occurrenceId: input.occurrenceId },
    select: { id: true, occurrenceNumber: true },
  });
  const withoutNumber = allLinks.filter((l) => l.occurrenceNumber === null).length;

  const wanted = input.numbers ? new Set(input.numbers) : null;
  const targets = allLinks
    .filter((l) => l.occurrenceNumber !== null)
    .filter((l) => !wanted || wanted.has(l.occurrenceNumber!))
    .sort((a, b) => a.occurrenceNumber! - b.occurrenceNumber!);

  const found = new Set(targets.map((l) => l.occurrenceNumber!));
  const missingNumbers = input.numbers ? input.numbers.filter((n) => !found.has(n)) : [];

  const entries: ExportedWord[] = [];
  for (let i = 0; i < targets.length; i += EXPORT_CHUNK_SIZE) {
    const chunk = targets.slice(i, i + EXPORT_CHUNK_SIZE);
    const rows = await prisma.wordOccurrence.findMany({
      where: { id: { in: chunk.map((l) => l.id) } },
      orderBy: { occurrenceNumber: "asc" },
      select: {
        occurrenceNumber: true,
        sortOrder: true,
        details: { orderBy: { sortOrder: "asc" }, select: { detail: true, sortOrder: true } },
        word: {
          select: {
            headword: true,
            createdAt: true,
            meanings: {
              orderBy: { sortOrder: "asc" },
              select: {
                partOfSpeech: true,
                pronunciation: true,
                sortOrder: true,
                pronunciationAudioUrl: true,
                texts: NOTE_SELECT,
                notes: NOTE_SELECT,
              },
            },
            examples: {
              orderBy: { sortOrder: "asc" },
              select: {
                kind: true,
                text: true,
                meaning: true,
                sortOrder: true,
                pronunciationAudioUrl: true,
                notes: NOTE_SELECT,
              },
            },
            relatedWords: {
              orderBy: { sortOrder: "asc" },
              select: {
                kind: true,
                term: true,
                partOfSpeech: true,
                pronunciation: true,
                meaning: true,
                sortOrder: true,
                pronunciationAudioUrl: true,
                linkedWord: { select: { headword: true } },
                notes: NOTE_SELECT,
              },
            },
            memos: NOTE_SELECT,
          },
        },
      },
    });

    for (const row of rows) {
      entries.push({
        occurrenceNumber: row.occurrenceNumber!,
        headword: row.word.headword,
        createdAt: row.word.createdAt.toISOString(),
        sortOrder: row.sortOrder,
        details: row.details,
        meanings: row.word.meanings,
        examples: row.word.examples,
        related: row.word.relatedWords.map(({ linkedWord, ...rest }) => ({
          ...rest,
          linkedHeadword: linkedWord?.headword ?? null,
        })),
        memos: row.word.memos,
      });
    }
  }

  return {
    data: {
      version: OCCURRENCE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      occurrence: {
        location: occurrence.location,
        autoNumbering: occurrence.autoNumbering,
        owner: {
          name: occurrence.owner.name,
          email: occurrence.owner.email,
          isSystem: occurrence.ownerId === SYSTEM_USER_ID,
        },
      },
      entries,
    },
    totalLinks: allLinks.length,
    withoutNumber,
    requestedCount: input.numbers?.length ?? null,
    missingNumbers,
  };
}

// --- 反映（書き込み） --------------------------------------------------------

export type SyncSkipReason =
  | "headword_mismatch" // 同じ掲載番号に別の見出し語の単語がある（取り違え防止で触らない）
  | "word_linked_to_other_number"; // 同じ見出し語の単語が、この掲載箇所の別番号に既にリンク済み

export type SyncSkip = {
  occurrenceNumber: number;
  headword: string;
  reason: SyncSkipReason;
  /** headword_mismatch のときの反映先の見出し語 / word_linked_to_other_number のときの既存番号。 */
  detail: string;
};

/** replaced = 既存単語の中身を置き換え / linked = 既存単語に掲載番号を張って置き換え / created = 単語ごと新規 */
export type SyncAction = "replaced" | "linked" | "created";

export type ContentCounts = { meanings: number; examples: number; related: number; memos: number };

export type SyncEntryResult = {
  occurrenceNumber: number;
  headword: string;
  action: SyncAction;
  before: ContentCounts;
  after: ContentCounts;
  /** 置き換え時に引き継いだ発音音源 URL の数。 */
  keptAudio: number;
};

export type UnresolvedLink = {
  occurrenceNumber: number;
  headword: string;
  linkedHeadword: string;
};

export type SyncReport = {
  source: { location: string; ownerEmail: string; exportedAt: string };
  target: {
    ownerId: string;
    ownerName: string;
    ownerEmail: string;
    isSystem: boolean;
    location: string;
    occurrenceId: string | null; // dry-run で未作成なら null
    occurrenceCreated: boolean; // 掲載箇所を作った（dry-run では作る予定）
  };
  totalEntries: number;
  results: SyncEntryResult[];
  skipped: SyncSkip[];
  unresolvedLinks: UnresolvedLink[];
  executed: boolean;
};

export type SyncInput = {
  /** 反映先のオーナー。 */
  ownerId: string;
  /** 反映先の掲載箇所名。無ければ作る。 */
  location: string;
  /** 掲載番号での絞り込み。省略で JSON の全件。 */
  numbers?: number[];
};

const EMPTY_COUNTS: ContentCounts = { meanings: 0, examples: 0, related: 0, memos: 0 };

function countsOf(entry: ExportedWord): ContentCounts {
  return {
    meanings: entry.meanings.length,
    examples: entry.examples.length,
    related: entry.related.length,
    memos: entry.memos.length,
  };
}

export function assertSupportedExport(data: OccurrenceExport): void {
  if (data.version !== OCCURRENCE_EXPORT_VERSION) {
    throw new UnsupportedExportVersionError(data.version);
  }
}

/**
 * 中間 JSON を反映先 DB に取り込む。対象単語の意味・例文・関連語・メモ・掲載番号詳細は
 * **丸ごと置き換える**（部分マージはしない）。単語本体・掲載番号・ブックマーク・解答履歴・
 * drill には触らない。発音音源 URL は置き換え前に退避して付け直す。
 */
export async function syncOccurrence(
  prisma: PrismaClient,
  data: OccurrenceExport,
  input: SyncInput,
  opts: { dryRun: boolean },
): Promise<SyncReport> {
  assertSupportedExport(data);

  const owner = await prisma.user.findUnique({
    where: { id: input.ownerId },
    select: { id: true, name: true, email: true },
  });
  if (!owner) throw new Error(`OWNER_NOT_FOUND: ${input.ownerId}`);
  const ownerId = owner.id;
  const location = input.location.trim();

  const wanted = input.numbers ? new Set(input.numbers) : null;
  const entries = data.entries
    .filter((e) => !wanted || wanted.has(e.occurrenceNumber))
    .sort((a, b) => a.occurrenceNumber - b.occurrenceNumber);

  // 反映先の掲載箇所。無ければ作る（createOccurrenceForUser / bulkImportWords と同じ scoped 判定）。
  const existing = await prisma.occurrence.findUnique({
    where: { ownerId_location: { ownerId, location } },
    select: { id: true },
  });
  let occurrenceId = existing?.id ?? null;
  const occurrenceCreated = !existing;
  if (!existing) {
    const conflict = await prisma.occurrence.findFirst({
      where: { ownerId: { in: scopedOwnerIds(ownerId) }, location },
      select: { id: true },
    });
    if (conflict) throw new OccurrenceLocationConflictError(location);
    if (!opts.dryRun) {
      occurrenceId = await prisma.$transaction(async (tx) => {
        const created = await tx.occurrence.create({
          data: { ownerId, location, autoNumbering: data.occurrence.autoNumbering },
          select: { id: true },
        });
        // 共通掲載箇所はオプトイン方式のため、オーナー本人ぶんだけ ON にする（bulkImportWords と同じ）。
        await tx.occurrencePresetSetting.create({
          data: { userId: ownerId, occurrenceId: created.id },
        });
        return created.id;
      });
    }
  }

  const report: SyncReport = {
    source: {
      location: data.occurrence.location,
      ownerEmail: data.occurrence.owner.email,
      exportedAt: data.exportedAt,
    },
    target: {
      ownerId,
      ownerName: owner.name,
      ownerEmail: owner.email,
      isSystem: ownerId === SYSTEM_USER_ID,
      location,
      occurrenceId,
      occurrenceCreated,
    },
    totalEntries: entries.length,
    results: [],
    skipped: [],
    unresolvedLinks: [],
    executed: false,
  };

  // 2 パス目でリンクを張り直す対象（1 パス目の時点ではリンク先の単語が未作成のことがある）。
  // dry-run では wordId が無い（書き込んでいない）ので、解決可否の確認だけを行う。
  const pendingLinks: { wordId: string | null; entry: ExportedWord }[] = [];

  for (const entry of entries) {
    // 掲載箇所ごと新規（dry-run で未作成）なら、全件が新規作成になる。
    const plan: EntryPlan = occurrenceId
      ? await planEntry(prisma, occurrenceId, ownerId, entry)
      : { action: "created", wordId: null, wordOccurrenceId: null, before: EMPTY_COUNTS };

    if ("skip" in plan) {
      report.skipped.push(plan.skip);
      continue;
    }

    const result: SyncEntryResult = {
      occurrenceNumber: entry.occurrenceNumber,
      headword: entry.headword,
      action: plan.action,
      before: plan.before,
      after: countsOf(entry),
      keptAudio: 0,
    };

    let writtenWordId: string | null = null;
    if (opts.dryRun) {
      // 退避される音源 URL の数だけ先に数えておく（実行時と同じ同定キーで見積もる）。
      result.keptAudio = plan.wordId ? await countKeptAudio(prisma, plan.wordId, entry) : 0;
    } else {
      const written = await writeEntry(prisma, {
        ownerId,
        occurrenceId: occurrenceId!,
        entry,
        plan,
      });
      result.keptAudio = written.keptAudio;
      writtenWordId = written.wordId;
    }
    report.results.push(result);

    if (entry.related.some((r) => r.linkedHeadword)) {
      pendingLinks.push({ wordId: writtenWordId, entry });
    }
  }

  // 2 パス目: 関連語の内部リンクを見出し語から張り直す。1 パス目の途中ではリンク先の単語が
  // まだ作られていないことがあるため、全件を書き終えてからまとめて解決する。
  // dry-run では書き込まず、解決できないリンクの報告だけを行う（反映で新規作成される
  // 単語は考慮できないため、実行後には解消しうる参考値）。
  for (const { wordId, entry } of pendingLinks) {
    for (const related of entry.related) {
      if (!related.linkedHeadword) continue;
      const linked = await prisma.word.findUnique({
        where: { ownerId_headword: { ownerId, headword: related.linkedHeadword } },
        select: { id: true },
      });
      if (!linked) {
        report.unresolvedLinks.push({
          occurrenceNumber: entry.occurrenceNumber,
          headword: entry.headword,
          linkedHeadword: related.linkedHeadword,
        });
        continue;
      }
      if (!wordId) continue;
      await prisma.relatedWord.updateMany({
        where: { wordId, sortOrder: related.sortOrder, term: related.term },
        data: { linkedWordId: linked.id },
      });
    }
  }

  report.executed = !opts.dryRun;
  return report;
}

type EntryPlan =
  | {
      action: SyncAction;
      wordId: string | null;
      wordOccurrenceId: string | null;
      before: ContentCounts;
    }
  | { skip: SyncSkip };

/** 反映先の現状を見て、この掲載番号をどう処理するかを決める（書き込みはしない）。 */
async function planEntry(
  prisma: PrismaClient,
  occurrenceId: string,
  ownerId: string,
  entry: ExportedWord,
): Promise<EntryPlan> {
  const byNumber = await prisma.wordOccurrence.findUnique({
    where: {
      occurrenceId_occurrenceNumber: { occurrenceId, occurrenceNumber: entry.occurrenceNumber },
    },
    select: { id: true, wordId: true, word: { select: { headword: true } } },
  });

  if (byNumber) {
    if (byNumber.word.headword !== entry.headword) {
      return {
        skip: {
          occurrenceNumber: entry.occurrenceNumber,
          headword: entry.headword,
          reason: "headword_mismatch",
          detail: `反映先の見出し語は "${byNumber.word.headword}"`,
        },
      };
    }
    return {
      action: "replaced",
      wordId: byNumber.wordId,
      wordOccurrenceId: byNumber.id,
      before: await countContents(prisma, byNumber.wordId),
    };
  }

  const byHeadword = await prisma.word.findUnique({
    where: { ownerId_headword: { ownerId, headword: entry.headword } },
    select: { id: true },
  });
  if (!byHeadword) {
    return { action: "created", wordId: null, wordOccurrenceId: null, before: EMPTY_COUNTS };
  }

  const otherLink = await prisma.wordOccurrence.findUnique({
    where: { wordId_occurrenceId: { wordId: byHeadword.id, occurrenceId } },
    select: { occurrenceNumber: true },
  });
  if (otherLink) {
    return {
      skip: {
        occurrenceNumber: entry.occurrenceNumber,
        headword: entry.headword,
        reason: "word_linked_to_other_number",
        detail: `同じ見出し語が掲載番号 ${otherLink.occurrenceNumber ?? "(なし)"} に紐づいています`,
      },
    };
  }
  return {
    action: "linked",
    wordId: byHeadword.id,
    wordOccurrenceId: null,
    before: await countContents(prisma, byHeadword.id),
  };
}

async function countContents(prisma: PrismaClient, wordId: string): Promise<ContentCounts> {
  const [meanings, examples, related, memos] = await Promise.all([
    prisma.meaning.count({ where: { wordId } }),
    prisma.example.count({ where: { wordId } }),
    prisma.relatedWord.count({ where: { wordId } }),
    prisma.memo.count({ where: { wordId } }),
  ]);
  return { meanings, examples, related, memos };
}

/**
 * 反映先の発音音源 URL を、置き換え後も同定できるキーで退避する。
 * meaning は sortOrder、example は本文、関連語は term で突き合わせる。
 */
type AudioBackup = {
  meanings: Map<number, string>;
  examples: Map<string, string>;
  related: Map<string, string>;
};

async function backupAudio(prisma: PrismaClient, wordId: string): Promise<AudioBackup> {
  const [meanings, examples, related] = await Promise.all([
    prisma.meaning.findMany({
      where: { wordId, pronunciationAudioUrl: { not: null } },
      select: { sortOrder: true, pronunciationAudioUrl: true },
    }),
    prisma.example.findMany({
      where: { wordId, pronunciationAudioUrl: { not: null } },
      select: { text: true, pronunciationAudioUrl: true },
    }),
    prisma.relatedWord.findMany({
      where: { wordId, pronunciationAudioUrl: { not: null } },
      select: { term: true, pronunciationAudioUrl: true },
    }),
  ]);
  return {
    meanings: new Map(meanings.map((m) => [m.sortOrder, m.pronunciationAudioUrl!])),
    examples: new Map(examples.map((e) => [e.text, e.pronunciationAudioUrl!])),
    related: new Map(related.map((r) => [r.term, r.pronunciationAudioUrl!])),
  };
}

/** dry-run 用: 実行したときに引き継がれる音源 URL の数を、実行時と同じキーで数える。 */
async function countKeptAudio(
  prisma: PrismaClient,
  wordId: string,
  entry: ExportedWord,
): Promise<number> {
  const backup = await backupAudio(prisma, wordId);
  let kept = 0;
  for (const m of entry.meanings) if (backup.meanings.has(m.sortOrder)) kept += 1;
  for (const e of entry.examples) if (backup.examples.has(e.text)) kept += 1;
  for (const r of entry.related) if (backup.related.has(r.term)) kept += 1;
  return kept;
}

/** 単語 1 件ぶんを 1 トランザクションで置き換える。 */
async function writeEntry(
  prisma: PrismaClient,
  args: {
    ownerId: string;
    occurrenceId: string;
    entry: ExportedWord;
    plan: Extract<EntryPlan, { action: SyncAction }>;
  },
): Promise<{ wordId: string; keptAudio: number }> {
  const { ownerId, occurrenceId, entry, plan } = args;
  const backup = plan.wordId ? await backupAudio(prisma, plan.wordId) : null;
  let keptAudio = 0;

  const wordId = await prisma.$transaction(async (tx) => {
    keptAudio = 0; // 再入時に二重計上しない
    let id = plan.wordId;
    if (!id) {
      const created = await tx.word.create({
        data: { ownerId, headword: entry.headword, createdAt: new Date(entry.createdAt) },
        select: { id: true },
      });
      id = created.id;
    }

    // 掲載番号リンクと掲載番号詳細。
    const link = plan.wordOccurrenceId
      ? await tx.wordOccurrence.update({
          where: { id: plan.wordOccurrenceId },
          data: { sortOrder: entry.sortOrder },
          select: { id: true },
        })
      : await tx.wordOccurrence.create({
          data: {
            wordId: id,
            occurrenceId,
            ownerId,
            sortOrder: entry.sortOrder,
            occurrenceNumber: entry.occurrenceNumber,
          },
          select: { id: true },
        });
    await tx.occurrenceDetail.deleteMany({ where: { wordOccurrenceId: link.id } });
    if (entry.details.length > 0) {
      await tx.occurrenceDetail.createMany({
        data: entry.details.map((d) => ({
          wordOccurrenceId: link.id,
          ownerId,
          detail: d.detail,
          sortOrder: d.sortOrder,
        })),
      });
    }

    // コンテンツは丸ごと置き換える（部分マージはしない）。
    await tx.meaning.deleteMany({ where: { wordId: id } });
    await tx.example.deleteMany({ where: { wordId: id } });
    await tx.relatedWord.deleteMany({ where: { wordId: id } });
    await tx.memo.deleteMany({ where: { wordId: id } });

    for (const meaning of entry.meanings) {
      const audio = backup?.meanings.get(meaning.sortOrder) ?? null;
      if (audio) keptAudio += 1;
      await tx.meaning.create({
        data: {
          wordId: id,
          ownerId,
          partOfSpeech: meaning.partOfSpeech,
          pronunciation: meaning.pronunciation,
          sortOrder: meaning.sortOrder,
          pronunciationAudioUrl: audio,
          texts: {
            create: meaning.texts.map((t) => ({ ownerId, text: t.text, sortOrder: t.sortOrder })),
          },
          notes: {
            create: meaning.notes.map((n) => ({ ownerId, text: n.text, sortOrder: n.sortOrder })),
          },
        },
        select: { id: true },
      });
    }

    for (const example of entry.examples) {
      const audio = backup?.examples.get(example.text) ?? null;
      if (audio) keptAudio += 1;
      await tx.example.create({
        data: {
          wordId: id,
          ownerId,
          kind: example.kind,
          text: example.text,
          meaning: example.meaning,
          sortOrder: example.sortOrder,
          pronunciationAudioUrl: audio,
          notes: {
            create: example.notes.map((n) => ({ ownerId, text: n.text, sortOrder: n.sortOrder })),
          },
        },
        select: { id: true },
      });
    }

    for (const related of entry.related) {
      const audio = backup?.related.get(related.term) ?? null;
      if (audio) keptAudio += 1;
      // linkedWordId は 2 パス目でまとめて張る（この時点ではリンク先が未作成のことがある）。
      await tx.relatedWord.create({
        data: {
          wordId: id,
          ownerId,
          kind: related.kind,
          term: related.term,
          partOfSpeech: related.partOfSpeech,
          pronunciation: related.pronunciation,
          meaning: related.meaning,
          sortOrder: related.sortOrder,
          pronunciationAudioUrl: audio,
          notes: {
            create: related.notes.map((n) => ({ ownerId, text: n.text, sortOrder: n.sortOrder })),
          },
        },
        select: { id: true },
      });
    }

    if (entry.memos.length > 0) {
      await tx.memo.createMany({
        data: entry.memos.map((m) => ({
          wordId: id,
          ownerId,
          text: m.text,
          sortOrder: m.sortOrder,
        })),
      });
    }

    return id;
  });

  return { wordId, keptAudio };
}
