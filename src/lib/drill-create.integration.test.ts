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
      sourceRangeFrom: 1,
      sourceRangeTo: 100,
      format: "CHOICE",
      timeoutSeconds: 5,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: true,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [
        { wordId: w1.id, result: "INCORRECT" },
        { wordId: w2.id, result: "CORRECT" },
        { wordId: w3.id, result: "INCORRECT" },
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
      // 元テストの範囲は実効範囲と独立に保存される（同じ範囲での再テスト用）
      sourceRangeFrom: 1,
      sourceRangeTo: 100,
      format: "CHOICE",
      timeoutSeconds: 5,
      roundCount: 0,
      completedAt: null,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
    });
    const remainingByWordId = new Map(drill.words.map((w) => [w.wordId, w.remaining]));
    expect(remainingByWordId.get(w1.id)).toBe(3);
    expect(remainingByWordId.get(w2.id)).toBe(1);
    expect(remainingByWordId.get(w3.id)).toBe(3);
  });

  test("omitted sourceRange is persisted as null (source test had no range)", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "本A");
    const w = await createQuizWordRow(user.id, "alpha", {
      occurrence: { id: occurrence.id, occurrenceNumber: 5 },
    });

    const { drillId } = await createDrillForUser(user.id, {
      occurrenceId: occurrence.id,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [{ wordId: w.id, result: "INCORRECT" }],
    });

    const drill = await prisma.drill.findUniqueOrThrow({ where: { id: drillId } });
    // NULL = 元テストが範囲指定なし（Occurrence 全体）
    expect(drill.sourceRangeFrom).toBeNull();
    expect(drill.sourceRangeTo).toBeNull();
  });

  test("custom remaining config is persisted on Drill and applied to initial remaining", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "本A");
    const wrong = await createQuizWordRow(user.id, "wrong", {
      occurrence: { id: occurrence.id, occurrenceNumber: 5 },
    });
    const vague = await createQuizWordRow(user.id, "vague", {
      occurrence: { id: occurrence.id, occurrenceNumber: 10 },
    });
    const correct = await createQuizWordRow(user.id, "correct", {
      occurrence: { id: occurrence.id, occurrenceNumber: 15 },
    });

    const { drillId } = await createDrillForUser(user.id, {
      occurrenceId: occurrence.id,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: true,
      resetRemaining: 5,
      vagueRemaining: 4,
      initialCorrectRemaining: 2,
      results: [
        { wordId: wrong.id, result: "INCORRECT" },
        { wordId: vague.id, result: "VAGUE" },
        { wordId: correct.id, result: "CORRECT" },
      ],
    });

    const drill = await prisma.drill.findUniqueOrThrow({
      where: { id: drillId },
      include: { words: true },
    });
    expect(drill).toMatchObject({
      resetRemaining: 5,
      vagueRemaining: 4,
      initialCorrectRemaining: 2,
    });
    const remainingByWordId = new Map(drill.words.map((w) => [w.wordId, w.remaining]));
    expect(remainingByWordId.get(wrong.id)).toBe(5);
    expect(remainingByWordId.get(vague.id)).toBe(4);
    expect(remainingByWordId.get(correct.id)).toBe(2);
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
        resetRemaining: 3,
        vagueRemaining: 2,
        initialCorrectRemaining: 1,
        results: [{ wordId: word.id, result: "INCORRECT" }],
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
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [
        { wordId: alive.id, result: "INCORRECT" },
        { wordId: deleted.id, result: "INCORRECT" },
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

  test("words without a numbered link (unnumbered / unlinked) are not inserted into DrillWord", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "本A");
    const numbered = await createQuizWordRow(user.id, "numbered", {
      occurrence: { id: occurrence.id, occurrenceNumber: 7 },
    });
    const unnumbered = await createQuizWordRow(user.id, "unnumbered", {
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });
    const unlinked = await createQuizWordRow(user.id, "unlinked");

    const { drillId } = await createDrillForUser(user.id, {
      occurrenceId: occurrence.id,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [
        { wordId: numbered.id, result: "INCORRECT" },
        { wordId: unnumbered.id, result: "INCORRECT" },
        { wordId: unlinked.id, result: "INCORRECT" },
      ],
    });

    const drill = await prisma.drill.findUniqueOrThrow({
      where: { id: drillId },
      include: { words: true },
    });
    // 番号付きリンクを持つ単語のみ投入される（番号なし・未リンクは出題不能なため除外。issue #106）
    expect(drill.rangeFrom).toBe(7);
    expect(drill.rangeTo).toBe(7);
    expect(drill.words).toHaveLength(1);
    expect(drill.words[0]).toMatchObject({ wordId: numbered.id, remaining: 3 });
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
        resetRemaining: 3,
        vagueRemaining: 2,
        initialCorrectRemaining: 1,
        results: [{ wordId: unnumbered.id, result: "INCORRECT" }],
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
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [
        { wordId: correct.id, result: "CORRECT" },
        { wordId: wrong.id, result: "INCORRECT" },
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

  test("VAGUE (うろ覚え) is always included with remaining 2 even when drillIncludeCorrect=false", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "本A");
    const correct = await createQuizWordRow(user.id, "correct", {
      occurrence: { id: occurrence.id, occurrenceNumber: 5 },
    });
    const vague = await createQuizWordRow(user.id, "vague", {
      occurrence: { id: occurrence.id, occurrenceNumber: 15 },
    });

    const { drillId } = await createDrillForUser(user.id, {
      occurrenceId: occurrence.id,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      drillIncludeCorrect: false,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
      results: [
        { wordId: correct.id, result: "CORRECT" },
        { wordId: vague.id, result: "VAGUE" },
      ],
    });

    const drill = await prisma.drill.findUniqueOrThrow({
      where: { id: drillId },
      include: { words: true },
    });
    // 正答は除外、うろ覚えはトグル OFF でも投入され残数 2（中間）。範囲もうろ覚え単語のみ。
    expect(drill.rangeFrom).toBe(15);
    expect(drill.rangeTo).toBe(15);
    expect(drill.words).toHaveLength(1);
    expect(drill.words[0]).toMatchObject({ wordId: vague.id, remaining: 2 });
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
        resetRemaining: 3,
        vagueRemaining: 2,
        initialCorrectRemaining: 1,
        results: [{ wordId: w.id, result: "CORRECT" }],
      }),
    ).rejects.toBeInstanceOf(EmptyDrillResultsError);
  });
});
