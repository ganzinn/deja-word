import { describe, expect, test } from "vitest";

import { createDrillForUser, EmptyDrillResultsError } from "@/lib/drill-create";
import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";

import { createOccurrenceRow, createQuizWordRow, createTestUser } from "../../tests/setup/fixtures";

describe("createDrillForUser", () => {
  test("initial remaining is 3 for incorrect / 1 for correct, range is min/max of occurrenceNumbers", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "本A");
    const w1 = await createQuizWordRow(user.id, "alpha", {
      occurrence: { id: occurrence.id, occurrenceNumber: 5 },
    });
    const w2 = await createQuizWordRow(user.id, "beta", {
      occurrence: { id: occurrence.id, occurrenceNumber: 30 },
    });
    const w3 = await createQuizWordRow(user.id, "gamma", {
      occurrence: { id: occurrence.id, occurrenceNumber: 12 },
    });

    const { drillId } = await createDrillForUser(user.id, {
      occurrenceId: occurrence.id,
      format: "CHOICE",
      timeoutSeconds: 5,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: true,
      results: [
        { wordId: w1.id, correct: false },
        { wordId: w2.id, correct: true },
        { wordId: w3.id, correct: false },
      ],
    });

    const drill = await prisma.drill.findUniqueOrThrow({
      where: { id: drillId },
      include: { words: { orderBy: { wordId: "asc" } } },
    });
    expect(drill).toMatchObject({
      ownerId: user.id,
      occurrenceId: occurrence.id,
      rangeFrom: 5,
      rangeTo: 30,
      format: "CHOICE",
      timeoutSeconds: 5,
      roundCount: 0,
      completedAt: null,
    });
    const remainingByWordId = new Map(drill.words.map((w) => [w.wordId, w.remaining]));
    expect(remainingByWordId.get(w1.id)).toBe(3);
    expect(remainingByWordId.get(w2.id)).toBe(1);
    expect(remainingByWordId.get(w3.id)).toBe(3);
  });

  test("invisible occurrence (another user's) throws OccurrenceNotFoundError", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const foreign = await createOccurrenceRow(stranger.id, "他人の本");
    const word = await createQuizWordRow(user.id, "alpha");

    await expect(
      createDrillForUser(user.id, {
        occurrenceId: foreign.id,
        format: "SELF_JUDGE",
        timeoutSeconds: null,
        choiceFirstMeaningTextOnly: false,
        drillIncludeCorrect: false,
        results: [{ wordId: word.id, correct: false }],
      }),
    ).rejects.toBeInstanceOf(OccurrenceNotFoundError);
  });

  test("deleted word is excluded from DrillWord creation and range computation", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "本A");
    const alive = await createQuizWordRow(user.id, "alive", {
      occurrence: { id: occurrence.id, occurrenceNumber: 10 },
    });
    const deleted = await createQuizWordRow(user.id, "deleted", {
      occurrence: { id: occurrence.id, occurrenceNumber: 99 },
    });
    await prisma.word.delete({ where: { id: deleted.id } });

    const { drillId } = await createDrillForUser(user.id, {
      occurrenceId: occurrence.id,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      results: [
        { wordId: alive.id, correct: false },
        { wordId: deleted.id, correct: false },
      ],
    });

    const drill = await prisma.drill.findUniqueOrThrow({
      where: { id: drillId },
      include: { words: true },
    });
    expect(drill.rangeFrom).toBe(10);
    expect(drill.rangeTo).toBe(10);
    expect(drill.timeoutSeconds).toBeNull();
    expect(drill.words).toHaveLength(1);
    expect(drill.words[0]).toMatchObject({ wordId: alive.id, remaining: 3 });
  });

  test("results without any numbered word in the occurrence throw EmptyDrillResultsError", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "本A");
    const unnumbered = await createQuizWordRow(user.id, "unnumbered", {
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });

    await expect(
      createDrillForUser(user.id, {
        occurrenceId: occurrence.id,
        format: "CHOICE",
        timeoutSeconds: null,
        choiceFirstMeaningTextOnly: false,
        drillIncludeCorrect: false,
        results: [{ wordId: unnumbered.id, correct: false }],
      }),
    ).rejects.toBeInstanceOf(EmptyDrillResultsError);
  });

  test("drillIncludeCorrect=false excludes correct words; range is from incorrect words only", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "本A");
    const correct = await createQuizWordRow(user.id, "correct", {
      occurrence: { id: occurrence.id, occurrenceNumber: 5 },
    });
    const wrong = await createQuizWordRow(user.id, "wrong", {
      occurrence: { id: occurrence.id, occurrenceNumber: 20 },
    });

    const { drillId } = await createDrillForUser(user.id, {
      occurrenceId: occurrence.id,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      results: [
        { wordId: correct.id, correct: true },
        { wordId: wrong.id, correct: false },
      ],
    });

    const drill = await prisma.drill.findUniqueOrThrow({
      where: { id: drillId },
      include: { words: true },
    });
    // 正答単語は除外され、誤答 1 件のみ。範囲も誤答単語の番号に縮まる。
    expect(drill.rangeFrom).toBe(20);
    expect(drill.rangeTo).toBe(20);
    expect(drill.words).toHaveLength(1);
    expect(drill.words[0]).toMatchObject({ wordId: wrong.id, remaining: 3 });
  });

  test("drillIncludeCorrect=false with all-correct results throws EmptyDrillResultsError", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "本A");
    const w = await createQuizWordRow(user.id, "alpha", {
      occurrence: { id: occurrence.id, occurrenceNumber: 5 },
    });

    await expect(
      createDrillForUser(user.id, {
        occurrenceId: occurrence.id,
        format: "CHOICE",
        timeoutSeconds: null,
        choiceFirstMeaningTextOnly: false,
        drillIncludeCorrect: false,
        results: [{ wordId: w.id, correct: true }],
      }),
    ).rejects.toBeInstanceOf(EmptyDrillResultsError);
  });
});
