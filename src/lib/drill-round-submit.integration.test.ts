import { describe, expect, test } from "vitest";

import { createDrillForUser } from "@/lib/drill-create";
import { submitDrillRoundForUser } from "@/lib/drill-round-submit";
import { prisma } from "@/lib/prisma";
import {
  DrillNotFoundError,
  DrillRoundConflictError,
} from "@/lib/quiz/handlers/drill-round-handler";

import { createOccurrenceRow, createQuizWordRow, createTestUser } from "../../tests/setup/fixtures";

/** 番号付き単語＋drill を一式作る（誤答=3 / 正答=1 は createDrillForUser が担う）。 */
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
    results: words.map((w, i) => ({ wordId: created[i].id, correct: w.correct })),
  });
  return { user, occurrence, drillId, wordIds: created.map((w) => w.id) };
}

function sortByWordId(rows: { wordId: string; remaining: number }[]) {
  return [...rows].sort((a, b) => a.wordId.localeCompare(b.wordId));
}

describe("submitDrillRoundForUser", () => {
  test("remaining transitions: CORRECT -1, INCORRECT / GAVE_UP reset to 3", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: true }, // remaining 1
      { headword: "beta", number: 2, correct: false }, // remaining 3
      { headword: "gamma", number: 3, correct: false }, // remaining 3
    ]);
    const [a, b, c] = wordIds;

    const result = await submitDrillRoundForUser(user.id, {
      drillId,
      expectedRoundCount: 0,
      answers: [
        { wordId: a, result: "CORRECT" },
        { wordId: b, result: "CORRECT" },
        { wordId: c, result: "GAVE_UP" },
      ],
    });

    expect(result.alreadyApplied).toBe(false);
    expect(result.completed).toBe(false);
    expect(sortByWordId(result.remaining)).toEqual(
      sortByWordId([
        { wordId: a, remaining: 0 },
        { wordId: b, remaining: 2 },
        { wordId: c, remaining: 3 },
      ]),
    );

    const drill = await prisma.drill.findUniqueOrThrow({ where: { id: drillId } });
    expect(drill.roundCount).toBe(1);
    expect(drill.completedAt).toBeNull();

    // 履歴は mode=DRILL・format は Drill.format（SELF_JUDGE）由来
    const answers = await prisma.quizAnswer.findMany({ where: { ownerId: user.id } });
    expect(answers).toHaveLength(3);
    expect(answers.every((row) => row.mode === "DRILL" && row.format === "SELF_JUDGE")).toBe(true);

    // 間違えた単語は次ラウンドで 3 にリセットされている（INCORRECT でも検証）
    const second = await submitDrillRoundForUser(user.id, {
      drillId,
      expectedRoundCount: 1,
      answers: [
        { wordId: b, result: "INCORRECT" },
        { wordId: c, result: "CORRECT" },
      ],
    });
    expect(sortByWordId(second.remaining)).toEqual(
      sortByWordId([
        { wordId: a, remaining: 0 },
        { wordId: b, remaining: 3 },
        { wordId: c, remaining: 2 },
      ]),
    );
  });

  test("TIMEOUT resets remaining to 3 and is saved as result=TIMEOUT", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: true }, // remaining 1
    ]);

    const result = await submitDrillRoundForUser(user.id, {
      drillId,
      expectedRoundCount: 0,
      answers: [{ wordId: wordIds[0], result: "TIMEOUT" }],
    });

    expect(result.remaining).toEqual([{ wordId: wordIds[0], remaining: 3 }]);

    const answers = await prisma.quizAnswer.findMany({ where: { ownerId: user.id } });
    expect(answers).toHaveLength(1);
    expect(answers[0].result).toBe("TIMEOUT");
  });

  test("sets completedAt when all words graduate", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: true },
      { headword: "beta", number: 2, correct: true },
    ]);

    const result = await submitDrillRoundForUser(user.id, {
      drillId,
      expectedRoundCount: 0,
      answers: wordIds.map((wordId) => ({ wordId, result: "CORRECT" as const })),
    });

    expect(result.completed).toBe(true);
    expect(result.remaining.every((w) => w.remaining === 0)).toBe(true);

    const drill = await prisma.drill.findUniqueOrThrow({ where: { id: drillId } });
    expect(drill.completedAt).not.toBeNull();
  });

  test("idempotency: resending the same expectedRoundCount returns alreadyApplied with one round's worth of data", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: true }, // remaining 1
      { headword: "beta", number: 2, correct: false }, // remaining 3
    ]);
    const [a, b] = wordIds;
    const answers = [
      { wordId: a, result: "CORRECT" as const },
      { wordId: b, result: "CORRECT" as const },
    ];

    const first = await submitDrillRoundForUser(user.id, {
      drillId,
      expectedRoundCount: 0,
      answers,
    });
    const second = await submitDrillRoundForUser(user.id, {
      drillId,
      expectedRoundCount: 0,
      answers,
    });

    expect(first.alreadyApplied).toBe(false);
    expect(second.alreadyApplied).toBe(true);
    expect(second.completed).toBe(false);
    // 残数は 1 回分しか適用されていない
    expect(sortByWordId(second.remaining)).toEqual(sortByWordId(first.remaining));
    expect(sortByWordId(second.remaining)).toEqual(
      sortByWordId([
        { wordId: a, remaining: 0 },
        { wordId: b, remaining: 2 },
      ]),
    );
    // 履歴も 1 回分（2 件）のみ
    expect(await prisma.quizAnswer.count({ where: { ownerId: user.id } })).toBe(2);
    const drill = await prisma.drill.findUniqueOrThrow({ where: { id: drillId } });
    expect(drill.roundCount).toBe(1);
  });

  test("stale tab (roundCount advanced by 2+) throws DrillRoundConflictError", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: false }, // remaining 3
    ]);
    const answers = [{ wordId: wordIds[0], result: "CORRECT" as const }];

    await submitDrillRoundForUser(user.id, { drillId, expectedRoundCount: 0, answers }); // 3 -> 2
    await submitDrillRoundForUser(user.id, { drillId, expectedRoundCount: 1, answers }); // 2 -> 1

    await expect(
      submitDrillRoundForUser(user.id, { drillId, expectedRoundCount: 0, answers }),
    ).rejects.toBeInstanceOf(DrillRoundConflictError);
    // 競合送信は何も適用しない
    expect(await prisma.quizAnswer.count({ where: { ownerId: user.id } })).toBe(2);
  });

  test("word deleted mid-round: skipped from history and remaining, completion judged on surviving rows", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 1, correct: true }, // remaining 1
      { headword: "beta", number: 2, correct: false }, // remaining 3
    ]);
    const [a, b] = wordIds;
    await prisma.word.delete({ where: { id: b } }); // DrillWord は Cascade で消える

    const result = await submitDrillRoundForUser(user.id, {
      drillId,
      expectedRoundCount: 0,
      answers: [
        { wordId: a, result: "CORRECT" },
        { wordId: b, result: "CORRECT" },
      ],
    });

    expect(result.remaining).toEqual([{ wordId: a, remaining: 0 }]);
    expect(result.completed).toBe(true);
    expect(await prisma.quizAnswer.count({ where: { ownerId: user.id } })).toBe(1);
    const drill = await prisma.drill.findUniqueOrThrow({ where: { id: drillId } });
    expect(drill.completedAt).not.toBeNull();
  });

  test("missing drill or another user's drill throws DrillNotFoundError", async () => {
    const { user, drillId } = await setupDrill([{ headword: "alpha", number: 1, correct: false }]);
    const stranger = await createTestUser();

    await expect(
      submitDrillRoundForUser(user.id, { drillId: "missing", expectedRoundCount: 0, answers: [] }),
    ).rejects.toBeInstanceOf(DrillNotFoundError);
    await expect(
      submitDrillRoundForUser(stranger.id, { drillId, expectedRoundCount: 0, answers: [] }),
    ).rejects.toBeInstanceOf(DrillNotFoundError);
  });
});
