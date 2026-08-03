// 掲載箇所（Occurrence）に紐づく英単語（Word）本体・その配下テーブル・発音音源 Blob を
// まとめて削除する運用ロジック。`deleteOccurrenceForUser`（リンクだけ消し Word は残す）
// とは別操作。tsx の運用スクリプトからも呼べるよう、prisma / blob は引数注入とし、
// `server-only` や prisma シングルトンへの実行時依存を持たない（型のみ type-only import）。

import type { PrismaClient } from "@/generated/prisma/client";
import type { BlobClient } from "@/lib/blob-client";

export class OccurrenceNotFoundError extends Error {
  constructor() {
    super("OCCURRENCE_NOT_FOUND");
    this.name = "OccurrenceNotFoundError";
  }
}

export type OccurrenceListItem = {
  id: string;
  location: string;
  ownerId: string;
  ownerEmail: string;
  words: number; // この掲載箇所に紐づく単語数（WordOccurrence リンク数）
};

/** 全掲載箇所を owner / location 順で列挙する（対話選択 UI 用）。 */
export async function listOccurrences(prisma: PrismaClient): Promise<OccurrenceListItem[]> {
  const rows = await prisma.occurrence.findMany({
    orderBy: [{ ownerId: "asc" }, { location: "asc" }],
    select: {
      id: true,
      location: true,
      ownerId: true,
      owner: { select: { email: true } },
      _count: { select: { wordLinks: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    location: r.location,
    ownerId: r.ownerId,
    ownerEmail: r.owner.email,
    words: r._count.wordLinks,
  }));
}

export type PurgeReport = {
  occurrence: { id: string; location: string; ownerId: string };
  words: number; // 削除対象 Word 数
  sharedWords: number; // うち他掲載箇所にも紐づく Word 数（完全削除されるため参考表示）
  meanings: number;
  examples: number;
  relatedWords: number;
  memos: number;
  quizAnswers: number;
  audioFiles: number; // 削除対象の発音音源 Blob 数（Meaning + RelatedWord + Example）
  drills: number;
  presetSettings: number;
  executed: boolean; // dryRun=false で実削除したか
};

/**
 * 掲載箇所配下の Word と Occurrence 本体を削除する。`dryRun` の場合は件数集計のみで
 * DB / Blob を一切変更しない。Word 削除は cascade で配下（Meaning / Example /
 * RelatedWord / Memo / QuizAnswer / WordOccurrence / DrillWord）を巻き込む。Occurrence
 * 削除は残る PresetSetting / Drill を巻き込み、QuizDefaultSetting は occurrenceId が null になる。
 *
 * Blob（発音音源）は DB cascade では消えないため、行削除前に URL を収集し、トランザクション
 * commit 後にベストエフォートで `blob.del` する（DB を真実とし、失敗してもログのみ）。
 */
export async function purgeOccurrence(
  prisma: PrismaClient,
  blob: BlobClient,
  occurrenceId: string,
  opts: { dryRun: boolean },
): Promise<PurgeReport> {
  const occurrence = await prisma.occurrence.findUnique({
    where: { id: occurrenceId },
    select: { id: true, location: true, ownerId: true },
  });
  if (!occurrence) throw new OccurrenceNotFoundError();

  const links = await prisma.wordOccurrence.findMany({
    where: { occurrenceId },
    select: { wordId: true },
  });
  const wordIds = [...new Set(links.map((l) => l.wordId))];

  const [
    meanings,
    relatedWords,
    examples,
    memos,
    quizAnswers,
    sharedLinks,
    presetSettings,
    drills,
  ] = await Promise.all([
    prisma.meaning.findMany({
      where: { wordId: { in: wordIds } },
      select: { pronunciationAudioUrl: true },
    }),
    prisma.relatedWord.findMany({
      where: { wordId: { in: wordIds } },
      select: { pronunciationAudioUrl: true },
    }),
    prisma.example.findMany({
      where: { wordId: { in: wordIds } },
      select: { pronunciationAudioUrl: true },
    }),
    prisma.memo.count({ where: { wordId: { in: wordIds } } }),
    prisma.quizAnswer.count({ where: { wordId: { in: wordIds } } }),
    prisma.wordOccurrence.findMany({
      where: { wordId: { in: wordIds }, NOT: { occurrenceId } },
      select: { wordId: true },
    }),
    prisma.occurrencePresetSetting.count({ where: { occurrenceId } }),
    prisma.drill.count({ where: { occurrenceId } }),
  ]);

  const audioUrls = [...meanings, ...relatedWords, ...examples]
    .map((r) => r.pronunciationAudioUrl)
    .filter((u): u is string => !!u);

  const report: PurgeReport = {
    occurrence,
    words: wordIds.length,
    sharedWords: new Set(sharedLinks.map((l) => l.wordId)).size,
    meanings: meanings.length,
    examples: examples.length,
    relatedWords: relatedWords.length,
    memos,
    quizAnswers,
    audioFiles: audioUrls.length,
    drills,
    presetSettings,
    executed: false,
  };

  if (opts.dryRun) return report;

  await prisma.$transaction(async (tx) => {
    if (wordIds.length > 0) {
      await tx.word.deleteMany({ where: { id: { in: wordIds } } });
    }
    await tx.occurrence.delete({ where: { id: occurrenceId } });
  });

  // DB を真実とし、削除確定後にベストエフォートで Blob 実体を消す。
  if (audioUrls.length > 0) {
    try {
      await blob.del(audioUrls);
    } catch (e) {
      console.error("[occurrence-purge] blob del failed", e);
    }
  }

  return { ...report, executed: true };
}
