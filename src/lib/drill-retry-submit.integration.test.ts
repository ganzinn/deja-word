import { describe, expect, test } from "vitest";

import { createDrillForUser } from "@/lib/drill-create";
import { submitDrillRetryForUser } from "@/lib/drill-retry-submit";
import { prisma } from "@/lib/prisma";
import { DrillNotFoundError } from "@/lib/quiz/handlers/drill-round-handler";

import { createOccurrenceRow, createQuizWordRow, createTestUser } from "../../tests/setup/fixtures";

/** 番号付き単語＋drill を一式作る（drill-round-submit.integration.test.ts と同形）。 */
async function setupDrill(words: { headword: string; number: number; correct: boolean }[]) {
  const user = await createTestUser();
  const occurrence = await createOccurrenceRow(user.id, "本A");
  const created: { id: string }[] = [];
  for (const w of words) {
    created.push(
      await createQuizWordRow(user.id, w.headword, {
        occurrence: { id: occurrence.id, occurrenceNumber: w.number },
      }),
    );
  }
  const { drillId } = await createDrillForUser(user.id, {
    occurrenceId: occurrence.id,
    format: "SELF_JUDGE",
    timeoutSeconds: null,
    choiceFirstMeaningTextOnly: false,
    drillIncludeCorrect: true,
    resetRemaining: 3,
    vagueRemaining: 2,
    initialCorrectRemaining: 1,
    results: words.map((w, i) => ({
      wordId: created[i].id,
      result: w.correct ? ("CORRECT" as const) : ("INCORRECT" as const),
    })),
  });
  return { user, occurrence, drillId, wordIds: created.map((w) => w.id) };
}

/** drill・DrillWord の残数スナップショット（不変検証用）。 */
async function drillSnapshot(drillId: string) {
  const drill = await prisma.drill.findUniqueOrThrow({
    where: { id: drillId },
    include: { words: { orderBy: { wordId: "asc" } } },
  });
  return {
    roundCount: drill.roundCount,
    completedAt: drill.completedAt,
    remaining: drill.words.map((w) => ({ wordId: w.wordId, remaining: w.remaining })),
  };
}

describe("submitDrillRetryForUser", () => {
  test("saves history as mode=DRILL_RETRY with format from the Drill row", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: true },
      { headword: "beta", number: 2, correct: false },
    ]);

    const result = await submitDrillRetryForUser(user.id, {
      drillId,
      answers: [
        { wordId: wordIds[0], result: "CORRECT" },
        { wordId: wordIds[1], result: "INCORRECT" },
      ],
    });

    expect(result.savedCount).toBe(2);
    expect(result.skippedWordIds).toEqual([]);
    const answers = await prisma.quizAnswer.findMany({ where: { ownerId: user.id } });
    expect(answers).toHaveLength(2);
    expect(answers.every((row) => row.mode === "DRILL_RETRY" && row.format === "SELF_JUDGE")).toBe(
      true,
    );
  });

  test("does not touch remaining / roundCount / completedAt (correct does not decrement, incorrect does not reset)", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: true }, // remaining 1
      { headword: "beta", number: 2, correct: false }, // remaining 3
    ]);
    const before = await drillSnapshot(drillId);

    await submitDrillRetryForUser(user.id, {
      drillId,
      answers: [
        { wordId: wordIds[0], result: "CORRECT" }, // 正解しても減らない
        { wordId: wordIds[1], result: "INCORRECT" }, // 間違えてもリセットしない
      ],
    });

    expect(await drillSnapshot(drillId)).toEqual(before);
  });

  test("skips deleted words and reports them in skippedWordIds", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: false },
      { headword: "beta", number: 2, correct: false },
    ]);
    await prisma.word.delete({ where: { id: wordIds[1] } });

    const result = await submitDrillRetryForUser(user.id, {
      drillId,
      answers: wordIds.map((wordId) => ({ wordId, result: "CORRECT" as const })),
    });

    expect(result.savedCount).toBe(1);
    expect(result.skippedWordIds).toEqual([wordIds[1]]);
    expect(await prisma.quizAnswer.count({ where: { ownerId: user.id } })).toBe(1);
  });

  test("missing drill or another user's drill throws DrillNotFoundError", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: false },
    ]);
    const stranger = await createTestUser();
    const answers = [{ wordId: wordIds[0], result: "CORRECT" as const }];

    await expect(
      submitDrillRetryForUser(user.id, { drillId: "missing", answers }),
    ).rejects.toBeInstanceOf(DrillNotFoundError);
    await expect(submitDrillRetryForUser(stranger.id, { drillId, answers })).rejects.toBeInstanceOf(
      DrillNotFoundError,
    );
  });
});
