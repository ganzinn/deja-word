import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import { submitQuizAnswersForUser } from "@/lib/quiz-answers-submit";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createQuizWordRow, createTestUser } from "../../tests/setup/fixtures";

describe("submitQuizAnswersForUser", () => {
  test("deleted word in answers: only existing words are saved, deleted one goes to skippedWordIds", async () => {
    const user = await createTestUser();
    const alive = await createQuizWordRow(user.id, "alive");
    const deleted = await createQuizWordRow(user.id, "deleted");
    await prisma.word.delete({ where: { id: deleted.id } });

    const result = await submitQuizAnswersForUser(user.id, {
      format: "CHOICE",
      answers: [
        { wordId: alive.id, result: "CORRECT" },
        { wordId: deleted.id, result: "INCORRECT" },
      ],
    });

    expect(result).toEqual({ savedCount: 1, skippedWordIds: [deleted.id] });

    const rows = await prisma.quizAnswer.findMany({ where: { ownerId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerId: user.id,
      wordId: alive.id,
      mode: "TEST",
      format: "CHOICE",
      result: "CORRECT",
    });
  });

  test("saves answers with mode TEST for own and system words", async () => {
    const user = await createTestUser();
    const own = await createQuizWordRow(user.id, "own-word");
    const system = await createQuizWordRow(SYSTEM_USER_ID, "system-word");

    const result = await submitQuizAnswersForUser(user.id, {
      format: "SELF_JUDGE",
      answers: [
        { wordId: own.id, result: "CORRECT" },
        { wordId: system.id, result: "GAVE_UP" },
      ],
    });

    expect(result).toEqual({ savedCount: 2, skippedWordIds: [] });

    const rows = await prisma.quizAnswer.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((r) => r.mode)).toEqual(["TEST", "TEST"]);
    expect(rows.map((r) => r.format)).toEqual(["SELF_JUDGE", "SELF_JUDGE"]);
  });

  test("saves a TIMEOUT answer as-is", async () => {
    const user = await createTestUser();
    const word = await createQuizWordRow(user.id, "slow-word");

    const result = await submitQuizAnswersForUser(user.id, {
      format: "CHOICE",
      answers: [{ wordId: word.id, result: "TIMEOUT" }],
    });

    expect(result).toEqual({ savedCount: 1, skippedWordIds: [] });

    const rows = await prisma.quizAnswer.findMany({ where: { ownerId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ wordId: word.id, mode: "TEST", result: "TIMEOUT" });
  });

  test("another user's word is treated as non-existent and skipped", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const own = await createQuizWordRow(user.id, "mine");
    const foreign = await createQuizWordRow(stranger.id, "not-mine");

    const result = await submitQuizAnswersForUser(user.id, {
      format: "MULTI_MEANING",
      answers: [
        { wordId: own.id, result: "CORRECT" },
        { wordId: foreign.id, result: "CORRECT" },
      ],
    });

    expect(result).toEqual({ savedCount: 1, skippedWordIds: [foreign.id] });
    expect(await prisma.quizAnswer.count({ where: { wordId: foreign.id } })).toBe(0);
  });
});
