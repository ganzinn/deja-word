import "server-only";

import { prisma } from "@/lib/prisma";
import { isTgExampleFormat } from "@/lib/quiz/format-options";
import { buildQuiz } from "@/lib/quiz/generation/build-quiz";
import { partitionMaterial, retargetMaterial } from "@/lib/quiz/generation/material";
import { occurrenceNumbersOf } from "@/lib/quiz/generation/order";
import { DrillNotFoundError } from "@/lib/quiz/handlers/drill-round-handler";
import type { QuizPayload } from "@/lib/quiz/payload";
import { fetchQuizSource } from "@/lib/quiz/queries/quiz-source";
import type { StartQuizInput } from "@/lib/schema/quiz";

/**
 * 未定着メンバーが全員出題不能で、自己修復削除（ADR-0067）の結果 drill が
 * その場で完了になった場合のエラー（返せるラウンドが無い）。
 */
export class DrillNoAskableWordsError extends Error {
  constructor() {
    super("DRILL_NO_ASKABLE_WORDS");
    this.name = "DrillNoAskableWordsError";
  }
}

/**
 * drill ラウンド 1 回分の問題を再生成する（初回・再開とも単一経路）。
 *
 * - 出題形式は `Drill.format` から導出（docs/adr/0038-drill-inherits-format-timeout.md）
 * - 出題順・選択肢は毎回サーバー再生成（シード永続化なし。docs/adr/0039-drill-reshuffle-each-round.md）。
 *   元テストが掲載番号順（`Drill.orderByOccurrenceNumber`）だったラウンドは再シャッフルせず
 *   毎回同じ掲載番号の昇順になる（ADR-0039 の明示的な例外。docs/adr/0072-quiz-order-by-occurrence-number.md）
 * - 出題対象は未定着（remaining > 0）の DrillWord の単語**全て**（docs/adr/0036-drill-remaining-count-model.md）。
 *   未定着メンバーは `ensureTargetWordIds` で範囲と独立に取得する（作成後に番号が
 *   範囲外へ移動しても出題し続け、完了不能化を防ぐ。issue #106）。範囲ベースの
 *   partition 結果を未定着 id で再分割し、定着済みを含む範囲内の他単語は
 *   同一 Occurrence プール（ダミー候補）側に回す
 * - **自己修復削除（ADR-0067）**: 未定着なのに出題対象として返ってこなかったメンバー
 *   （＝対象 Occurrence への番号付きリンク喪失、または形式適格性喪失）の DrillWord 行を
 *   削除し、不変条件「DrillWord のメンバー = 出題可能」を回復する。読み取り経路の
 *   書き込みは自己修復としての意図的な例外。未定着メンバーが全員出題不能だった場合は、
 *   削除後に残る行が全て remaining 0 のため、送信側完了判定の鏡像としてその場で
 *   `completedAt` を設定し（設定しないと送信すべきラウンドが発生せず完了機会が失われる）、
 *   返せるラウンドが無いので `DrillNoAskableWordsError` を throw する
 * - 現在の `roundCount` を返し、クライアントはラウンド送信の `expectedRoundCount` に使う
 *   （docs/adr/0033-drill-round-count-cas.md）
 * - `sourceTest`（元テストの開始入力）と `occurrenceName` を返し、完了画面の
 *   「同じ範囲でもう一度テストする」とその範囲表示に使う（docs/adr/0042-retest-same-range.md。
 *   再開経路では `startInput` がクライアントに無いためサーバーから供給する）
 */
export async function generateDrillRoundForUser(
  userId: string,
  input: { drillId: string },
): Promise<{
  quiz: QuizPayload;
  roundCount: number;
  sourceTest: StartQuizInput;
  occurrenceName: string;
}> {
  const drill = await prisma.drill.findFirst({
    where: { id: input.drillId, ownerId: userId },
    select: {
      occurrenceId: true,
      occurrence: { select: { location: true } },
      format: true,
      timeoutSeconds: true,
      choiceFirstMeaningTextOnly: true,
      orderByOccurrenceNumber: true,
      rangeFrom: true,
      rangeTo: true,
      sourceRangeFrom: true,
      sourceRangeTo: true,
      sourceBookmarkedOnly: true,
      roundCount: true,
      words: { where: { remaining: { gt: 0 } }, select: { wordId: true } },
    },
  });
  if (!drill) throw new DrillNotFoundError();

  // 範囲（rangeFrom/rangeTo）は範囲内ダミー候補の供給用に渡し、未定着メンバー自体は
  // ensureTargetWordIds で範囲と独立に取得する。全件モード drill は occurrenceId / range とも null。
  // ブックマーク条件は再適用しない（drill は DrillWord スナップショット。決定 5）。
  const memberIds = drill.words.map((w) => w.wordId);
  const { targetRows, sameOccurrenceRows, fallbackRows, tgExampleRows } = await fetchQuizSource(
    userId,
    drill.occurrenceId,
    { from: drill.rangeFrom ?? undefined, to: drill.rangeTo ?? undefined },
    { includeTgExamples: isTgExampleFormat(drill.format), ensureTargetWordIds: memberIds },
  );
  // 自己修復削除（ADR-0067）: 未定着なのに出題対象として返ってこなかったメンバー
  // （番号付きリンク喪失 or 形式適格性喪失）の DrillWord 行を削除する。
  // 範囲外へ移動しただけのメンバーは ensureTargetWordIds で targetRows に含まれるため対象外。
  const askableIds = new Set(targetRows.map((row) => row.id));
  const unaskableIds = memberIds.filter((id) => !askableIds.has(id));
  if (unaskableIds.length > 0) {
    const unaskableWhere = { drillId: input.drillId, wordId: { in: unaskableIds } };
    if (unaskableIds.length === memberIds.length) {
      // 未定着メンバーが全員出題不能 → 削除後に残る DrillWord 行は全て remaining 0。
      // 送信側（applyDrillRound）の完了判定の鏡像としてここで完了を確定する
      // （送信すべきラウンドが発生しないため、ここで確定しないと完了機会が永久に失われる）。
      await prisma.$transaction([
        prisma.drillWord.deleteMany({ where: unaskableWhere }),
        prisma.drill.updateMany({
          where: { id: input.drillId, completedAt: null },
          data: { completedAt: new Date() },
        }),
      ]);
      throw new DrillNoAskableWordsError();
    }
    await prisma.drillWord.deleteMany({ where: unaskableWhere });
  }

  const partitioned = partitionMaterial(
    targetRows,
    sameOccurrenceRows,
    fallbackRows,
    tgExampleRows,
  );
  const material = retargetMaterial(partitioned, new Set(memberIds));

  return {
    quiz: {
      ...buildQuiz(drill.format, material, Math.random, {
        choiceFirstMeaningTextOnly: drill.choiceFirstMeaningTextOnly,
        // 掲載箇所なし drill は掲載番号を持たないため常にランダム（全件モードの扱いと一貫）。
        occurrenceNumberByWordId:
          drill.orderByOccurrenceNumber && drill.occurrenceId !== null
            ? occurrenceNumbersOf(targetRows)
            : undefined,
      }),
      timeoutSeconds: drill.timeoutSeconds,
    },
    roundCount: drill.roundCount,
    sourceTest: {
      // 全件モード drill は occurrenceId が null。StartQuizInput の optional に合わせて undefined へ
      occurrenceId: drill.occurrenceId ?? undefined,
      // NULL = 元テストが範囲指定なし（Occurrence 全体）。StartQuizInput の optional に合わせる
      rangeFrom: drill.sourceRangeFrom ?? undefined,
      rangeTo: drill.sourceRangeTo ?? undefined,
      // 元テストの「ブックマークのみ」指定。再テストは開始時に今のブックマーク集合で再評価する（決定 5）
      bookmarkedOnly: drill.sourceBookmarkedOnly,
      format: drill.format,
      timeoutSeconds: drill.timeoutSeconds,
      choiceFirstMeaningTextOnly: drill.choiceFirstMeaningTextOnly,
      // 元テストの「掲載番号順に出題する」指定。再テストにも引き継ぐ（ADR-0042 の同じ範囲と同流儀）
      orderByOccurrenceNumber: drill.orderByOccurrenceNumber,
    },
    occurrenceName: drill.occurrence?.location ?? "",
  };
}
