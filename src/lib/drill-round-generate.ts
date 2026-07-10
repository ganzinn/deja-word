import "server-only";

import { prisma } from "@/lib/prisma";
import { isTgExampleFormat } from "@/lib/quiz/format-options";
import { buildQuiz } from "@/lib/quiz/generation/build-quiz";
import { partitionMaterial, retargetMaterial } from "@/lib/quiz/generation/material";
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
 * drill ラウンド 1 回分の問題を再生成する（初回・再開とも単一経路。06-drill-mode.md 決定 6）。
 *
 * - 出題形式は `Drill.format` から導出（同 決定 4）
 * - 出題順・選択肢は毎回サーバー再生成（シード永続化なし。同 決定 5）
 * - 出題対象は未定着（remaining > 0）の DrillWord の単語**全て**（同 決定 1）。
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
 *   （05-architecture.md 決定 4）
 * - `sourceTest`（元テストの開始入力）と `occurrenceName` を返し、完了画面の
 *   「同じ範囲でもう一度テストする」とその範囲表示に使う（06-drill-mode.md 決定 11。
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
      rangeFrom: true,
      rangeTo: true,
      sourceRangeFrom: true,
      sourceRangeTo: true,
      roundCount: true,
      words: { where: { remaining: { gt: 0 } }, select: { wordId: true } },
    },
  });
  if (!drill) throw new DrillNotFoundError();

  // 範囲（rangeFrom/rangeTo）は範囲内ダミー候補の供給用に渡し、未定着メンバー自体は
  // ensureTargetWordIds で範囲と独立に取得する。
  const memberIds = drill.words.map((w) => w.wordId);
  const { targetRows, sameOccurrenceRows, fallbackRows, tgExampleRows } = await fetchQuizSource(
    userId,
    drill.occurrenceId,
    { from: drill.rangeFrom, to: drill.rangeTo },
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
      }),
      timeoutSeconds: drill.timeoutSeconds,
    },
    roundCount: drill.roundCount,
    sourceTest: {
      occurrenceId: drill.occurrenceId,
      // NULL = 元テストが範囲指定なし（Occurrence 全体）。StartQuizInput の optional に合わせる
      rangeFrom: drill.sourceRangeFrom ?? undefined,
      rangeTo: drill.sourceRangeTo ?? undefined,
      format: drill.format,
      timeoutSeconds: drill.timeoutSeconds,
      choiceFirstMeaningTextOnly: drill.choiceFirstMeaningTextOnly,
    },
    occurrenceName: drill.occurrence.location,
  };
}
