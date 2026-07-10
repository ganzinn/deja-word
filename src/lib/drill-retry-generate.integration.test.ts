import { describe, expect, test } from "vitest";

import { createDrillForUser } from "@/lib/drill-create";
import { EmptyDrillRetryError, generateDrillRetryForUser } from "@/lib/drill-retry-generate";
import { submitDrillRoundForUser } from "@/lib/drill-round-submit";
import { prisma } from "@/lib/prisma";
import { DrillNotFoundError } from "@/lib/quiz/handlers/drill-round-handler";

import { createOccurrenceRow, createQuizWordRow, createTestUser } from "../../tests/setup/fixtures";

/** 番号付き単語＋drill を一式作る（drill-round-submit.integration.test.ts と同形）。 */
async function setupDrill(
  words: { headword: string; number: number; correct: boolean }[],
  options: { timeoutSeconds?: number | null } = {},
) {
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
    timeoutSeconds: options.timeoutSeconds ?? null,
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

describe("generateDrillRetryForUser", () => {
  test("generates exactly the requested word set, including a graduated (remaining=0) word", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: true }, // remaining 1
      { headword: "beta", number: 2, correct: false }, // remaining 3
    ]);
    const [a, b] = wordIds;

    // ラウンド送信で alpha を卒業させる（remaining 1 -> 0）
    const round = await submitDrillRoundForUser(user.id, {
      drillId,
      expectedRoundCount: 0,
      answers: [
        { wordId: a, result: "CORRECT" },
        { wordId: b, result: "CORRECT" },
      ],
    });
    expect(round.remaining.find((w) => w.wordId === a)?.remaining).toBe(0);

    const { quiz } = await generateDrillRetryForUser(user.id, { drillId, wordIds: [a, b] });
    expect(quiz.format).toBe("SELF_JUDGE");
    expect(quiz.questions.map((q) => q.wordId).sort()).toEqual([a, b].sort());
  });

  test("ignores wordIds that do not belong to the drill", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: false },
    ]);
    // 同じユーザーの可視単語でも、drill 外なら出題対象にならない
    const outsider = await createQuizWordRow(user.id, "outsider");

    const { quiz } = await generateDrillRetryForUser(user.id, {
      drillId,
      wordIds: [wordIds[0], outsider.id, "missing"],
    });
    expect(quiz.questions.map((q) => q.wordId)).toEqual([wordIds[0]]);
  });

  test("throws EmptyDrillRetryError when no wordIds intersect the drill", async () => {
    const { user, drillId } = await setupDrill([{ headword: "alpha", number: 1, correct: false }]);

    await expect(
      generateDrillRetryForUser(user.id, { drillId, wordIds: ["missing"] }),
    ).rejects.toBeInstanceOf(EmptyDrillRetryError);
  });

  test("derives timeoutSeconds from the Drill row", async () => {
    const { user, drillId, wordIds } = await setupDrill(
      [{ headword: "alpha", number: 1, correct: false }],
      { timeoutSeconds: 7 },
    );

    const { quiz } = await generateDrillRetryForUser(user.id, { drillId, wordIds });
    expect(quiz.timeoutSeconds).toBe(7);
  });

  test("a member whose occurrenceNumber moved outside the range is still asked", async () => {
    const { user, occurrence, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 5, correct: false },
      { headword: "beta", number: 12, correct: false },
    ]);
    // 実効範囲は 5..12。beta の番号を範囲外（99）へ移動する
    await prisma.wordOccurrence.updateMany({
      where: { wordId: wordIds[1], occurrenceId: occurrence.id },
      data: { occurrenceNumber: 99 },
    });

    const { quiz } = await generateDrillRetryForUser(user.id, { drillId, wordIds });
    // 範囲外へ移動しても指定メンバーは再テストで出題される（issue #106）
    expect(quiz.questions.map((q) => q.wordId).sort()).toEqual([...wordIds].sort());
  });

  test("a word deleted after the round drops out of the generated quiz", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: false },
      { headword: "beta", number: 2, correct: false },
    ]);
    await prisma.word.delete({ where: { id: wordIds[1] } }); // DrillWord は Cascade で消える

    const { quiz } = await generateDrillRetryForUser(user.id, { drillId, wordIds });
    expect(quiz.questions.map((q) => q.wordId)).toEqual([wordIds[0]]);
  });

  test("missing drill or another user's drill throws DrillNotFoundError", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: false },
    ]);
    const stranger = await createTestUser();

    await expect(
      generateDrillRetryForUser(user.id, { drillId: "missing", wordIds }),
    ).rejects.toBeInstanceOf(DrillNotFoundError);
    await expect(
      generateDrillRetryForUser(stranger.id, { drillId, wordIds }),
    ).rejects.toBeInstanceOf(DrillNotFoundError);
  });
});
