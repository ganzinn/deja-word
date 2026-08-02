// 既存の掲載箇所に登録済みの単語へ、発音音源（mp3）を一括登録する運用ロジック。
// 対象は「掲載番号（WordOccurrence.occurrenceNumber）で指定された単語の先頭 Meaning」で、
// 音源ファイルは掲載番号で突合する（ターゲット1900 のように本の見出し番号＝掲載番号の教材向け）。
// tsx から呼べるよう prisma / blob は引数注入とし、`server-only` や `@/` 実行時 import を持たない。
//
// 単語登録（bulk-word-import）→ 関連語登録（related-word-import）と同じく、非原子的に
// 1 件ずつ確定させる（本番 Blob / Neon への往復が長く、長大トランザクションを避けるため）。
// 登録済み（pronunciationAudioUrl が非 null）の行は常にスキップするので、中断しても
// 同じコマンドの再実行で続きから再開できる。

import { resolveImportOwner } from "./import-owner";

import type { PrismaClient } from "@/generated/prisma/client";
import type { BlobClient } from "@/lib/blob-client";

// owner 解決系のエラーは import-owner に集約。CLI のメッセージ分岐のため re-export する。
export { SystemUserMissingError, UserNotFoundByEmailError } from "./import-owner";

/** 音源ファイル 1 件＝投入単位。ファイル名のパース・実体の読み出しは呼び出し側（スクリプト）の責務。 */
export type AudioImportRow = {
  /** 突合キー。ファイル名の連番 = 掲載番号。 */
  occurrenceNumber: number;
  /** レポート表示用のファイル名（Blob には保存名を持ち込まない）。 */
  fileName: string;
  /** ファイル名に添えられた見出し語ヒント（`0004_mean.mp3` の `mean`）。無ければ null。 */
  headwordHint: string | null;
  /** mp3 のバイト列を読み出す。実登録時にのみ呼ばれる（dry-run では読まない）。 */
  readBytes: () => Promise<Uint8Array>;
};

/** email 省略（undefined）= system ユーザー宛て。location は単語を登録した掲載箇所名。 */
export type AudioImportInput = { email?: string; location: string };

export type AudioSkipReason =
  | "word_not_found" // その掲載番号の単語が無い
  | "no_meaning" // 単語に Meaning が 1 件も無い（音源の保持先が無い）
  | "already_registered" // 先頭 Meaning に音源が登録済み（再実行時の再開点）
  | "duplicate_number"; // 同じ掲載番号のファイルが複数あった（2 件目以降）

export type AudioSkip = {
  occurrenceNumber: number;
  fileName: string;
  headword: string | null;
  reason: AudioSkipReason;
};

/** ファイル名のヒントと DB の見出し語が食い違った行。登録は掲載番号を正として続行する。 */
export type AudioHintMismatch = {
  occurrenceNumber: number;
  fileName: string;
  headwordHint: string;
  headword: string;
};

/** 実登録中に put / update が失敗した行。ログのみで続行し、最後にまとめて報告する。 */
export type AudioFailure = {
  occurrenceNumber: number;
  fileName: string;
  headword: string;
  message: string;
};

export type AudioImportReport = {
  location: string;
  ownerId: string;
  ownerEmail: string;
  isSystem: boolean;
  occurrenceId: string;
  totalFiles: number;
  willUpload: number; // 登録（予定）件数
  uploaded: number; // 実際に登録した件数（dry-run は 0）
  skipped: AudioSkip[];
  mismatches: AudioHintMismatch[];
  /** 掲載箇所にあるのに対応ファイルが無い掲載番号（音源が付かないまま残る単語）。 */
  numbersWithoutFile: number[];
  failures: AudioFailure[];
  executed: boolean;
};

export class OccurrenceNotFoundError extends Error {
  constructor(public readonly location: string) {
    super(`OCCURRENCE_NOT_FOUND: ${location}`);
    this.name = "OccurrenceNotFoundError";
  }
}

/** Blob のパスは Web からのアップロード（pronunciation-audio.ts）と同じ規約に揃える。 */
const AUDIO_MIME = "audio/mpeg";
const PRONUNCIATION_FILENAME = "pronunciation.mp3";
function blobPathFor(meaningId: string): string {
  return `audio/meaning/${meaningId}/${PRONUNCIATION_FILENAME}`;
}

type PlannedUpload = {
  occurrenceNumber: number;
  fileName: string;
  headword: string;
  meaningId: string;
  readBytes: () => Promise<Uint8Array>;
};

type TargetWord = { headword: string; firstMeaning: { id: string; hasAudio: boolean } | null };

/**
 * 掲載番号 → 対象単語（先頭 Meaning 付き）。掲載番号なしの紐付けは対象外。
 * ここで引いた行がそのまま書き込み先になるため、紐付け・単語とも `ownerId` を素で条件に入れる
 * （読み書き非対称の原則。所有検証は scopedOwnerIds ではなく本人 owner のみ）。
 */
async function loadTargetsByNumber(
  prisma: PrismaClient,
  ownerId: string,
  occurrenceId: string,
): Promise<Map<number, TargetWord>> {
  const links = await prisma.wordOccurrence.findMany({
    where: { occurrenceId, ownerId, occurrenceNumber: { not: null }, word: { ownerId } },
    select: {
      occurrenceNumber: true,
      word: {
        select: {
          headword: true,
          // 表示（word-detail-view）・出題（quiz の questionBaseOf）とも先頭 Meaning の音源を使うため、
          // 先頭 1 件だけを対象にする。並び順は一覧・詳細と同じ sortOrder 昇順。
          meanings: {
            where: { ownerId },
            select: { id: true, pronunciationAudioUrl: true },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            take: 1,
          },
        },
      },
    },
  });

  const map = new Map<number, TargetWord>();
  for (const link of links) {
    if (link.occurrenceNumber === null) continue;
    const first = link.word.meanings[0];
    map.set(link.occurrenceNumber, {
      headword: link.word.headword,
      firstMeaning: first ? { id: first.id, hasAudio: first.pronunciationAudioUrl !== null } : null,
    });
  }
  return map;
}

/** 投入行を「登録する / スキップする」に仕分けし、ヒント不一致も拾う（登録は掲載番号を正とする）。 */
function planRows(
  rows: AudioImportRow[],
  targets: Map<number, TargetWord>,
): { plans: PlannedUpload[]; skipped: AudioSkip[]; mismatches: AudioHintMismatch[] } {
  const plans: PlannedUpload[] = [];
  const skipped: AudioSkip[] = [];
  const mismatches: AudioHintMismatch[] = [];
  const seenNumbers = new Set<number>();

  for (const row of rows) {
    const target = targets.get(row.occurrenceNumber);
    const headword = target?.headword ?? null;

    if (seenNumbers.has(row.occurrenceNumber)) {
      skipped.push({ ...rowKey(row), headword, reason: "duplicate_number" });
      continue;
    }
    seenNumbers.add(row.occurrenceNumber);

    if (!target) {
      skipped.push({ ...rowKey(row), headword: null, reason: "word_not_found" });
      continue;
    }
    if (row.headwordHint !== null && row.headwordHint !== target.headword) {
      mismatches.push({
        occurrenceNumber: row.occurrenceNumber,
        fileName: row.fileName,
        headwordHint: row.headwordHint,
        headword: target.headword,
      });
    }
    if (!target.firstMeaning) {
      skipped.push({ ...rowKey(row), headword, reason: "no_meaning" });
      continue;
    }
    if (target.firstMeaning.hasAudio) {
      skipped.push({ ...rowKey(row), headword, reason: "already_registered" });
      continue;
    }
    plans.push({
      occurrenceNumber: row.occurrenceNumber,
      fileName: row.fileName,
      headword: target.headword,
      meaningId: target.firstMeaning.id,
      readBytes: row.readBytes,
    });
  }
  return { plans, skipped, mismatches };
}

function rowKey(row: AudioImportRow): { occurrenceNumber: number; fileName: string } {
  return { occurrenceNumber: row.occurrenceNumber, fileName: row.fileName };
}

export async function importPronunciationAudio(
  prisma: PrismaClient,
  blob: BlobClient,
  input: AudioImportInput,
  rows: AudioImportRow[],
  opts: { dryRun: boolean; onProgress?: (done: number, total: number) => void },
): Promise<AudioImportReport> {
  const { ownerId, ownerEmail, isSystem } = await resolveImportOwner(prisma, input.email);
  const location = input.location.trim();

  const occurrence = await prisma.occurrence.findFirst({
    where: { ownerId, location },
    select: { id: true },
  });
  if (!occurrence) throw new OccurrenceNotFoundError(location);
  const occurrenceId = occurrence.id;

  const targets = await loadTargetsByNumber(prisma, ownerId, occurrenceId);
  const { plans, skipped, mismatches } = planRows(rows, targets);

  const fileNumbers = new Set(rows.map((r) => r.occurrenceNumber));
  const numbersWithoutFile = [...targets.keys()]
    .filter((n) => !fileNumbers.has(n))
    .sort((a, b) => a - b);

  const base = {
    location,
    ownerId,
    ownerEmail,
    isSystem,
    occurrenceId,
    totalFiles: rows.length,
    willUpload: plans.length,
    skipped,
    mismatches,
    numbersWithoutFile,
  } satisfies Partial<AudioImportReport>;

  if (opts.dryRun) {
    return { ...base, uploaded: 0, failures: [], executed: false };
  }

  // 1 件ずつ put → update（ADR-0044 と同じ「Blob 先・DB 後」の順序）。put 失敗なら完全無変更、
  // update 失敗なら孤児 Blob が残るだけで DB は無傷（再実行で登録し直せる）。
  const failures: AudioFailure[] = [];
  let uploaded = 0;
  for (const [i, plan] of plans.entries()) {
    try {
      const bytes = await plan.readBytes();
      // Buffer（Uint8Array<ArrayBufferLike>）はそのまま BlobPart にできないため詰め替える。
      const file = new File([new Uint8Array(bytes)], PRONUNCIATION_FILENAME, { type: AUDIO_MIME });
      const { url } = await blob.put(blobPathFor(plan.meaningId), file);
      await prisma.meaning.update({
        where: { id: plan.meaningId },
        data: { pronunciationAudioUrl: url },
        select: { id: true },
      });
      uploaded += 1;
    } catch (e) {
      failures.push({
        occurrenceNumber: plan.occurrenceNumber,
        fileName: plan.fileName,
        headword: plan.headword,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    opts.onProgress?.(i + 1, plans.length);
  }

  return { ...base, uploaded, failures, executed: true };
}
