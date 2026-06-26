import "server-only";

import { nextRemaining } from "@/lib/quiz/generation/next-remaining";
import { insertQuizAnswers, type AnswerInput } from "@/lib/quiz/handlers/quiz-answer-handler";
import type { Tx } from "@/lib/quiz/handlers/shared";

/** drill が存在しない／自分の所有でない場合のエラー（存在を漏らさない）。 */
export class DrillNotFoundError extends Error {
  constructor() {
    super("DRILL_NOT_FOUND");
    this.name = "DrillNotFoundError";
  }
}

/**
 * ラウンド送信の競合エラー。`roundCount` が期待値＋1 以外（2 ラウンド以上
 * 進んでいる古いタブ等）の場合に投げる（05-architecture.md 決定 4）。
 */
export class DrillRoundConflictError extends Error {
  constructor() {
    super("DRILL_ROUND_CONFLICT");
    this.name = "DrillRoundConflictError";
  }
}

export type DrillRoundInput = {
  drillId: string;
  expectedRoundCount: number;
  answers: AnswerInput[];
};

export type DrillRoundResult = {
  /** 確定残数（現存する DrillWord 全件。wordId 昇順）。 */
  remaining: { wordId: string; remaining: number }[];
  completed: boolean;
  alreadyApplied: boolean;
};

/**
 * drill ラウンド 1 回分（履歴一括保存＋残数更新＋完了判定）を適用する。
 * 全体を 1 tx で呼ぶこと（UseCase `submitDrillRoundForUser` が tx を張る）。
 *
 * 冪等化は `Drill.roundCount` の compare-and-swap（05-architecture.md 決定 4）:
 * 1. roundCount=expectedRoundCount の行だけを increment（CAS）
 * 2. 成功 → 通常経路（insertQuizAnswers → nextRemaining で残数更新 → 完了判定）
 * 3. 失敗 → 再読込し、期待値＋1 なら適用済みとして確定残数を冪等返却、
 *    それ以外は DrillRoundConflictError
 */
export async function applyDrillRound(
  tx: Tx,
  userId: string,
  input: DrillRoundInput,
): Promise<DrillRoundResult> {
  const { count } = await tx.drill.updateMany({
    where: { id: input.drillId, ownerId: userId, roundCount: input.expectedRoundCount },
    data: { roundCount: { increment: 1 } },
  });

  if (count === 0) {
    const drill = await tx.drill.findFirst({
      where: { id: input.drillId, ownerId: userId },
      select: { roundCount: true, completedAt: true },
    });
    if (!drill) throw new DrillNotFoundError();
    if (drill.roundCount !== input.expectedRoundCount + 1) throw new DrillRoundConflictError();
    // 適用済み（自分の再送 or 別タブの同一ラウンド先行送信）: 確定残数を読み直して冪等成功
    const words = await tx.drillWord.findMany({
      where: { drillId: input.drillId },
      orderBy: { wordId: "asc" },
      select: { wordId: true, remaining: true },
    });
    return {
      remaining: words,
      completed: drill.completedAt !== null,
      alreadyApplied: true,
    };
  }

  // 通常経路（CAS 成功＝このラウンドの適用権を獲得）
  const drill = await tx.drill.findFirst({
    where: { id: input.drillId, ownerId: userId },
    select: {
      format: true,
      completedAt: true,
      resetRemaining: true,
      vagueRemaining: true,
      initialCorrectRemaining: true,
    },
  });
  if (!drill) throw new DrillNotFoundError(); // CAS 成功直後のため通常は到達しない

  // 残数遷移は drill ごとに保存された設定値を使う（生成時と同じ値。06-drill-mode.md 決定 1）。
  const remainingConfig = {
    resetRemaining: drill.resetRemaining,
    vagueRemaining: drill.vagueRemaining,
    initialCorrectRemaining: drill.initialCorrectRemaining,
  };

  // QuizAnswer.format は Drill.format から導出（06-drill-mode.md 決定 4）。
  // ラウンド中に削除された単語は handler 側で履歴 insert が skip される（決定 3 のフィルタ）。
  const { skippedWordIds } = await insertQuizAnswers(tx, userId, {
    mode: "DRILL",
    format: drill.format,
    answers: input.answers,
  });
  const skipped = new Set(skippedWordIds);

  const words = await tx.drillWord.findMany({
    where: { drillId: input.drillId },
    orderBy: { wordId: "asc" },
    select: { wordId: true, remaining: true },
  });
  const remainingByWordId = new Map(words.map((w) => [w.wordId, w.remaining]));

  const updatedWordIds = new Set<string>();
  for (const answer of input.answers) {
    if (skipped.has(answer.wordId)) continue; // 削除された単語は残数更新も skip
    const current = remainingByWordId.get(answer.wordId);
    if (current === undefined) continue; // この drill に属さない単語（DrillWord 行なし）は無視
    remainingByWordId.set(answer.wordId, nextRemaining(current, answer.result, remainingConfig));
    updatedWordIds.add(answer.wordId);
  }
  for (const wordId of updatedWordIds) {
    const value = remainingByWordId.get(wordId);
    if (value === undefined) continue;
    await tx.drillWord.update({
      where: { drillId_wordId: { drillId: input.drillId, wordId } },
      data: { remaining: value },
    });
  }

  const remaining = [...remainingByWordId.entries()].map(([wordId, value]) => ({
    wordId,
    remaining: value,
  }));
  // 完了判定は残っている DrillWord 行だけで行う（05-architecture.md 決定 4）
  const completed = remaining.every((w) => w.remaining === 0);
  if (completed && drill.completedAt === null) {
    await tx.drill.update({
      where: { id: input.drillId },
      data: { completedAt: new Date() },
    });
  }

  return { remaining, completed, alreadyApplied: false };
}
