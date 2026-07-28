import "server-only";

import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";
import { scopedOwnerIds } from "@/lib/system-user";
import type { TgExampleRow } from "@/lib/quiz/generation/material";

/**
 * 対象 Occurrence がユーザーに可視であることを確認する（不在・不可視なら
 * OccurrenceNotFoundError）。問題生成・プレビューの両経路で契約を共有する。
 */
export async function assertOccurrenceVisible(userId: string, occurrenceId: string): Promise<void> {
  const allowed = scopedOwnerIds(userId);
  const occurrence = await prisma.occurrence.findFirst({
    where: { id: occurrenceId, ownerId: { in: allowed } },
    select: { id: true },
  });
  if (!occurrence) throw new OccurrenceNotFoundError();
}

/**
 * ダミー候補プールの目標件数（出題対象を含む）。
 *
 * ダミー（誤答選択肢）は `selectDummies` で使い、優先プール（出題対象 ∪ 同一 Occurrence の範囲外単語）→
 * 補完プール（Occurrence 外の全登録単語）の順で選ぶ。**出題対象（targets）自身も優先プールの候補**に
 * なるため、targets が十分あればダミー専用の取得は不要。よって候補プールがこの件数に達するよう、
 * targets → 同一 Occurrence（範囲外）→ 他 Occurrence の優先順で**不足分だけ**取得する。
 * ダミーは 1 問あたり数件・問題間で使い回せるため、この件数あれば dedup 後も充足する
 * （docs/adr/0030-dummy-pool-bounded-fetch.md・2026-06-21 追補）。
 */
export const DUMMY_POOL_SIZE = 50;

/**
 * 「使える TG 例文」の共有述語: `kind=TARGET` かつ `meaning` が非 null かつ空文字でない Example。
 * TG 例文形式（CHOICE_TG / CHOICE_TG_JA_EN）の出題にはこのうち sortOrder 最小の 1 件を使う。
 *
 * count（`some`）と取得（`fetchTgExampleRows`）で同じ述語を使い、プレビューの対象件数と
 * 実出題数を完全一致させる。空白のみの meaning は SQL で判別できないため「使える」扱いで統一する
 * （JS 側も trim しない同一判定。件数乖離ゼロを優先し、空白のみはデータ入力異常として許容）。
 */
function usableTgExampleWhere(allowed: string[]) {
  return {
    kind: "TARGET" as const,
    ownerId: { in: allowed },
    AND: [{ meaning: { not: null } }, { meaning: { not: "" } }],
  };
}

/**
 * 問題生成・drill ラウンド生成の素材を取得する。
 *
 * 範囲（range）判定を SQL に寄せ、ダミー候補プールを {@link DUMMY_POOL_SIZE} 件まで優先順で
 * **不足分だけ**取得する（最大 3 クエリ、逐次）:
 * - `targetRows`: 範囲内の出題対象。仕様『範囲内全出題』のため上限なしで全件取得。
 *   出題対象だけは対象 Occurrence への紐付き（`wordOccurrences`）の掲載番号も持つ
 *   （掲載番号順出題の並べ替えキー。docs/adr/0072-quiz-order-by-occurrence-number.md）。
 * - `sameOccurrenceRows`: 同一 Occurrence の範囲外・番号なし単語（優先ダミー）。
 *   不足分 `DUMMY_POOL_SIZE - targets` 件だけ取得（0 なら取得しない）。
 * - `fallbackRows`: Occurrence 外の全登録単語（補完ダミー）。
 *   残りの不足分 `DUMMY_POOL_SIZE - targets - sameOccurrence` 件だけ取得（0 なら取得しない）。
 * 行→素材（targets / sameOccurrencePool / allWordsPool）の対応は純関数 partitionMaterial に委ねる。
 *
 * TG 例文形式（`includeTgExamples: true`）のときだけ、収集済み全単語の使える TG 例文を
 * 追加の 1 クエリで取得して `tgExampleRows` に返す（非 TG 形式は追加コストゼロ）。
 *
 * `ensureTargetWordIds`（drill のラウンド・再テスト生成が使う）を指定すると、その単語は
 * 範囲（from/to）と独立に出題対象として取得する（対象 Occurrence への番号付きリンクと
 * 形式適格は要求。番号が範囲外へ移動した drill メンバーの救済。issue #106）。指定単語は
 * ダミー候補クエリから除外して重複取得を防ぐ。targets が増えるぶんプールの take 算出は
 * 自動的に織り込まれる。未指定（空）なら従来の範囲判定と完全に同一。
 *
 * `bookmarkedOnly: true`（省略時 false）で出題対象をブックマーク済み単語に絞る（ダミー候補には
 * 効かない）。`occurrenceId: null` は「ブックマーク全件モード」で、掲載箇所・掲載番号の条件を
 * 課さずブックマーク済みの適格単語を全件出題する（掲載番号なし・掲載箇所未紐付けも含む。
 * ADR-0070 / ADR-0022 の明示的例外）。同一 Occurrence プールは概念がないため空、補完プールは
 * 全登録単語になる。ensureTargetWordIds はどちらのモードでもブックマーク条件を課さず救済する。
 *
 * プレビューはこの重い経路を使わず、件数のみを `countQuizTargets` /
 * `countQuizSourceExclusions` で取得する（docs/adr/0030-dummy-pool-bounded-fetch.md）。
 */
export async function fetchQuizSource(
  userId: string,
  occurrenceId: string | null,
  range: { from?: number; to?: number },
  options: {
    includeTgExamples?: boolean;
    ensureTargetWordIds?: readonly string[];
    bookmarkedOnly?: boolean;
  } = {},
) {
  const allowed = scopedOwnerIds(userId);
  const ensureIds = options.ensureTargetWordIds ?? [];
  const bookmarkedOnly = options.bookmarkedOnly ?? false;
  // 全件モード（掲載箇所未指定）では掲載箇所の可視性検証はスキップする（検証対象がない）。
  if (occurrenceId !== null) await assertOccurrenceVisible(userId, occurrenceId);

  const hasVisibleMeaning = {
    meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } },
  } as const;
  // 出題対象・ダミー候補の適格述語。TG 例文形式は「使える TG 例文を持つ単語」で判定し、
  // 単語自身の可視 MeaningText の有無は問わない（TG 四択は Example の text/meaning だけで成立する）。
  // 非 TG 形式は従来どおり可視 MeaningText 1 件以上を要求する。
  const eligibleWord = options.includeTgExamples
    ? { examples: { some: usableTgExampleWhere(allowed) } }
    : hasVisibleMeaning;
  // 「ブックマークのみ」絞り込み: 出題対象（targets）の Word 述語に AND で足す。
  // ダミー候補（sameOccurrenceRows / fallbackRows）には足さない（決定 2）。
  const bookmarkedWord = bookmarkedOnly ? { bookmarks: { some: { userId } } } : {};
  // 掲載箇所指定モードの述語群（全件モードでは掲載箇所の概念がないため null）。
  const occ =
    occurrenceId === null
      ? null
      : {
          linkedToOccurrence: {
            wordOccurrences: { some: { occurrenceId, ownerId: { in: allowed } } },
          },
          // 出題対象の述語: occurrenceNumber が非 null かつ範囲内（`countQuizTargets` と一致）。
          inRange: {
            wordOccurrences: {
              some: {
                occurrenceId,
                ownerId: { in: allowed },
                occurrenceNumber: {
                  not: null,
                  ...(range.from !== undefined ? { gte: range.from } : {}),
                  ...(range.to !== undefined ? { lte: range.to } : {}),
                },
              },
            },
          },
          // 範囲を問わない番号付きリンクの述語（ensureTargetWordIds 用）。番号付きリンク自体を
          // 失った単語（リンク解除・番号 null 化）は指定されていても出題対象に含めない。
          numbered: {
            wordOccurrences: {
              some: { occurrenceId, ownerId: { in: allowed }, occurrenceNumber: { not: null } },
            },
          },
        };
  const select = {
    id: true,
    headword: true,
    meanings: {
      where: { ownerId: { in: allowed } },
      orderBy: { sortOrder: "asc" },
      select: {
        partOfSpeech: true,
        pronunciationAudioUrl: true,
        texts: {
          where: { ownerId: { in: allowed } },
          orderBy: { sortOrder: "asc" },
          select: { text: true },
        },
      },
    },
  } as const;
  // 出題対象だけ、対象 Occurrence への紐付きの掲載番号も取る（掲載番号順出題 `orderByOccurrenceNumber`
  // の並べ替えキー。`@@unique([wordId, occurrenceId])` により該当行は高々 1 件）。全件モード
  // （occurrenceId が null）は掲載箇所の概念が無いため `in: []` で常に空配列にし、分岐で行の型が
  // 変わらないようにする（掲載番号順は全件モードでは無効。ADR-0072）。
  const targetSelect = {
    ...select,
    wordOccurrences: {
      where: {
        occurrenceId: occurrenceId === null ? { in: [] } : occurrenceId,
        ownerId: { in: allowed },
      },
      select: { occurrenceNumber: true },
    },
  } as const;

  // 出題対象。掲載箇所指定モードは範囲内（∧ ブックマーク）、全件モードはブックマーク済み全件
  // （掲載番号なし・掲載箇所未紐付けの単語も含む）。ensureTargetWordIds の単語はどちらのモードでも
  // ブックマーク条件を課さず救済する（drill スナップショット）。全件モードでは番号条件も課さない。
  const targetRows = await prisma.word.findMany({
    where: {
      ownerId: { in: allowed },
      ...eligibleWord,
      ...(occ === null
        ? ensureIds.length > 0
          ? { OR: [bookmarkedWord, { id: { in: [...ensureIds] } }] }
          : bookmarkedWord
        : ensureIds.length > 0
          ? {
              OR: [
                { ...occ.inRange, ...bookmarkedWord },
                { id: { in: [...ensureIds] }, ...occ.numbered },
              ],
            }
          : { ...occ.inRange, ...bookmarkedWord }),
    },
    select: targetSelect,
  });

  // ダミー候補プールを DUMMY_POOL_SIZE 件まで、同一 Occurrence（範囲外）→ 他 Occurrence の
  // 順で不足分だけ補う。fallback の取得数は同一 Occurrence の実取得数に依存するため逐次。
  // 全件モードでは同一 Occurrence の概念がないため sameOccurrenceRows は常に空。
  const sameOccTake = Math.max(0, DUMMY_POOL_SIZE - targetRows.length);
  const sameOccurrenceRows =
    occ === null || sameOccTake === 0
      ? []
      : await prisma.word.findMany({
          where: {
            ownerId: { in: allowed },
            ...eligibleWord,
            ...occ.linkedToOccurrence,
            NOT: occ.inRange,
            // ensure 指定の単語は target 側で取得済み（範囲外でも）。ダミー候補と二重に
            // 取得すると retargetMaterial の union で同一単語が重複出題されるため除外する。
            ...(ensureIds.length > 0 ? { id: { notIn: [...ensureIds] } } : {}),
          },
          select,
          orderBy: { createdAt: "desc" },
          take: sameOccTake,
        });

  // 補完プール。掲載箇所指定モードは Occurrence 外、全件モードは全登録単語（ブックマーク外含む）。
  const fallbackTake = Math.max(0, DUMMY_POOL_SIZE - targetRows.length - sameOccurrenceRows.length);
  const fallbackRows =
    fallbackTake === 0
      ? []
      : await prisma.word.findMany({
          where: {
            ownerId: { in: allowed },
            ...eligibleWord,
            ...(occ === null ? {} : { NOT: occ.linkedToOccurrence }),
            ...(ensureIds.length > 0 ? { id: { notIn: [...ensureIds] } } : {}),
          },
          select,
          orderBy: { createdAt: "desc" },
          take: fallbackTake,
        });

  // TG 例文形式のときだけ、収集済み全単語（targets ＋ダミー候補プール）の使える TG 例文を
  // 1 クエリで取得し、単語ごとに sortOrder 最小の 1 件へ選抜する（`Example` は wordId インデックス済み）。
  const tgExampleRows = !options.includeTgExamples
    ? []
    : pickFirstTgExamples(
        await prisma.example.findMany({
          where: {
            wordId: {
              in: [...targetRows, ...sameOccurrenceRows, ...fallbackRows].map((w) => w.id),
            },
            ...usableTgExampleWhere(allowed),
          },
          orderBy: { sortOrder: "asc" },
          select: { wordId: true, text: true, meaning: true },
        }),
      );

  return { targetRows, sameOccurrenceRows, fallbackRows, tgExampleRows };
}

// sortOrder 昇順の取得行から単語ごとに先頭 1 件を選抜する（meaning 非 null は where 済みだが型を絞る）。
function pickFirstTgExamples(
  rows: { wordId: string; text: string; meaning: string | null }[],
): TgExampleRow[] {
  const picked = new Map<string, TgExampleRow>();
  for (const row of rows) {
    if (row.meaning === null || row.meaning === "") continue;
    if (!picked.has(row.wordId)) {
      picked.set(row.wordId, { wordId: row.wordId, text: row.text, meaning: row.meaning });
    }
  }
  return [...picked.values()];
}

export type QuizSourceRow = Awaited<ReturnType<typeof fetchQuizSource>>["targetRows"][number];

/**
 * 対象 Occurrence 内の除外内訳（番号なし・意味未登録・TG例文なし）を count クエリで返す。
 *
 * `noMeaning`（意味未登録）と `noTgExample`（使える TG 例文を持たない）は形式で排他:
 * - 非 TG 形式（`countTgExample: false`）: 意味未登録が除外理由なので `noMeaning` を数え、`noTgExample` は null。
 * - TG 例文形式（`countTgExample: true`）: 意味は問わず TG 例文の有無が除外理由なので `noTgExample` を数え、
 *   `noMeaning` は null（count クエリを発行せず、UI も表示しない）。
 * `noNumber` は両形式共通（範囲指定に番号が要る）。各件数は独立カウント（番号なしの単語は
 * `noNumber` と `noMeaning`/`noTgExample` の両方に数えられうる）。
 *
 * `bookmarkedOnly: true`（省略時 false）で除外内訳もブックマーク済み単語にスコープする（例:
 * `noNumber` は「ブックマーク済みだが掲載番号なしで対象外」の件数になる）。`occurrenceId: null`
 * の全件モードでは掲載箇所の概念がないため `noNumber` は `null`（noMeaning / noTgExample の
 * 形式排他 null と同じ流儀）、noMeaning / noTgExample はブックマーク済み全体にスコープして数える。
 */
export async function countQuizSourceExclusions(
  userId: string,
  occurrenceId: string | null,
  options: { countTgExample?: boolean; bookmarkedOnly?: boolean } = {},
): Promise<{ noNumber: number | null; noMeaning: number | null; noTgExample: number | null }> {
  const allowed = scopedOwnerIds(userId);
  // 「ブックマークのみ」時は除外内訳もブックマーク済み単語へスコープする。
  const bookmarkedWord = options.bookmarkedOnly ? { bookmarks: { some: { userId } } } : {};
  // noMeaning / noTgExample の母集団。掲載箇所指定モードは当該 Occurrence 紐付き、全件モードは
  // ブックマーク条件のみ（掲載箇所の概念がない）。
  const linkedWord =
    occurrenceId === null
      ? { ...bookmarkedWord }
      : {
          wordOccurrences: { some: { occurrenceId, ownerId: { in: allowed } } },
          ...bookmarkedWord,
        };
  const [noNumber, noMeaning, noTgExample] = await Promise.all([
    // 全件モードは掲載箇所の概念がないため noNumber は null。
    occurrenceId === null
      ? Promise.resolve(null)
      : prisma.wordOccurrence.count({
          where: {
            occurrenceId,
            ownerId: { in: allowed },
            occurrenceNumber: null,
            word: { ownerId: { in: allowed }, ...bookmarkedWord },
          },
        }),
    // 意味未登録は非 TG 形式の除外理由。TG 形式では meaning を問わないため数えず null を返す
    // （TG の除外は noTgExample が捕捉する）。noTgExample とちょうど排他になる。
    options.countTgExample
      ? Promise.resolve(null)
      : prisma.word.count({
          where: {
            ownerId: { in: allowed },
            ...linkedWord,
            NOT: { meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } } },
          },
        }),
    options.countTgExample
      ? prisma.word.count({
          where: {
            ownerId: { in: allowed },
            ...linkedWord,
            NOT: { examples: { some: usableTgExampleWhere(allowed) } },
          },
        })
      : Promise.resolve(null),
  ]);
  return { noNumber, noMeaning, noTgExample };
}

/**
 * 出題対象（target）の件数を count クエリで返す。プレビューの軽量経路用。
 *
 * partitionMaterial の target 定義と一致させる: 対象 Occurrence に occurrenceNumber 非 null かつ
 * 範囲内の wordOccurrence を持ち、かつ形式ごとの適格述語（下記）を満たす単語。
 * 範囲（from/to）は未指定なら制限なし。
 *
 * 適格述語（fetchQuizSource の eligibleWord と一致）:
 * - 非 TG 形式: 可視 MeaningText を 1 件以上持つ。
 * - TG 例文形式（`requireTgExample: true`）: 「使える TG 例文を持つ」。可視 MeaningText は問わない
 *   （TG 四択は Example の text/meaning だけで成立するため）。生成側（buildChoiceTgQuestions の
 *   usable targets）と件数を一致させる。
 *
 * `bookmarkedOnly: true`（省略時 false）でブックマーク済み単語に絞る。`occurrenceId: null` の
 * 全件モードでは掲載箇所・掲載番号の条件を課さず、ブックマーク済みの適格単語を数える。
 */
export async function countQuizTargets(
  userId: string,
  occurrenceId: string | null,
  range: { from?: number; to?: number },
  options: { requireTgExample?: boolean; bookmarkedOnly?: boolean } = {},
): Promise<number> {
  const allowed = scopedOwnerIds(userId);
  const bookmarkedWord = options.bookmarkedOnly ? { bookmarks: { some: { userId } } } : {};
  return prisma.word.count({
    where: {
      ownerId: { in: allowed },
      // 全件モード（掲載箇所未指定）では掲載箇所・掲載番号の条件を課さない。
      ...(occurrenceId === null
        ? {}
        : {
            wordOccurrences: {
              some: {
                occurrenceId,
                ownerId: { in: allowed },
                occurrenceNumber: {
                  not: null,
                  ...(range.from !== undefined ? { gte: range.from } : {}),
                  ...(range.to !== undefined ? { lte: range.to } : {}),
                },
              },
            },
          }),
      // TG 例文形式は「使える TG 例文を持つ単語」だけを対象とし可視 MeaningText は問わない。
      // 非 TG 形式は可視 MeaningText 1 件以上を要求する。fetchQuizSource の eligibleWord と一致。
      ...(options.requireTgExample
        ? { examples: { some: usableTgExampleWhere(allowed) } }
        : { meanings: { some: { texts: { some: { ownerId: { in: allowed } } } } } }),
      ...bookmarkedWord,
    },
  });
}
