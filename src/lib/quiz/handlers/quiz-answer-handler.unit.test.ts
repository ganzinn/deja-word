import { describe, expect, test, vi } from "vitest";

import { insertQuizAnswers } from "@/lib/quiz/handlers/quiz-answer-handler";
import type { Tx } from "@/lib/quiz/handlers/shared";

import { makeTxMock } from "../../../../tests/setup/tx-mock";

// tx-mock（02 で追加済みの quizAnswer delegate）を流用しつつ、本 handler が使う
// word.findMany だけローカルに補う（tx-mock.ts は 02 のみが触る共有物のため変更しない）。
function makeTx(existingWordIds: string[]) {
  const mock = makeTxMock();
  const wordFindMany = vi.fn().mockResolvedValue(existingWordIds.map((id) => ({ id })));
  const tx = { ...mock, word: { findMany: wordFindMany } } as unknown as Tx;
  return { tx, mock, wordFindMany };
}

describe("insertQuizAnswers", () => {
  test("existing words only: filters by visible-word check and reports skippedWordIds", async () => {
    const { tx, mock, wordFindMany } = makeTx(["w1", "w3"]);
    mock.quizAnswer.createMany.mockResolvedValueOnce({ count: 2 });

    const result = await insertQuizAnswers(tx, "u1", {
      mode: "TEST",
      format: "CHOICE",
      answers: [
        { wordId: "w1", result: "CORRECT" },
        { wordId: "w2", result: "INCORRECT" },
        { wordId: "w3", result: "GAVE_UP" },
      ],
    });

    expect(wordFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["w1", "w2", "w3"] }, ownerId: { in: ["system", "u1"] } },
      select: { id: true },
    });
    expect(mock.quizAnswer.createMany).toHaveBeenCalledWith({
      data: [
        { ownerId: "u1", wordId: "w1", mode: "TEST", format: "CHOICE", result: "CORRECT" },
        { ownerId: "u1", wordId: "w3", mode: "TEST", format: "CHOICE", result: "GAVE_UP" },
      ],
    });
    expect(result).toEqual({ savedCount: 2, skippedWordIds: ["w2"] });
  });

  test("all words exist: skippedWordIds is empty", async () => {
    const { tx, mock } = makeTx(["w1", "w2"]);
    mock.quizAnswer.createMany.mockResolvedValueOnce({ count: 2 });

    const result = await insertQuizAnswers(tx, "u1", {
      mode: "DRILL",
      format: "SELF_JUDGE",
      answers: [
        { wordId: "w1", result: "CORRECT" },
        { wordId: "w2", result: "CORRECT" },
      ],
    });

    expect(result).toEqual({ savedCount: 2, skippedWordIds: [] });
    expect(mock.quizAnswer.createMany).toHaveBeenCalledTimes(1);
  });

  test("no word exists: createMany is not called and all answers are skipped", async () => {
    const { tx, mock } = makeTx([]);

    const result = await insertQuizAnswers(tx, "u1", {
      mode: "TEST",
      format: "MULTI_MEANING",
      answers: [
        { wordId: "w1", result: "CORRECT" },
        { wordId: "w2", result: "INCORRECT" },
      ],
    });

    expect(mock.quizAnswer.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ savedCount: 0, skippedWordIds: ["w1", "w2"] });
  });
});
