import { describe, expect, test, vi } from "vitest";

import {
  applyDrillRound,
  DrillNotFoundError,
  DrillRoundConflictError,
} from "@/lib/quiz/handlers/drill-round-handler";
import type { Tx } from "@/lib/quiz/handlers/shared";

import { makeTxMock } from "../../../../tests/setup/tx-mock";

// tx-mock（02 で追加済みの drill / drillWord / quizAnswer delegate）を流用しつつ、
// 本 handler が使う drill.updateMany / drillWord.findMany / word.findMany（insertQuizAnswers
// 経由）だけローカルに補う（tx-mock.ts は 02 のみが触る共有物のため変更しない。05 と同じ補い方）。
function makeTx(existingWordIds: string[]) {
  const mock = makeTxMock();
  const drillUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
  const drillWordFindMany = vi.fn().mockResolvedValue([]);
  const wordFindMany = vi.fn().mockResolvedValue(existingWordIds.map((id) => ({ id })));
  const tx = {
    ...mock,
    word: { findMany: wordFindMany },
    drill: { ...mock.drill, updateMany: drillUpdateMany },
    drillWord: { ...mock.drillWord, findMany: drillWordFindMany },
  } as unknown as Tx;
  return { tx, mock, drillUpdateMany, drillWordFindMany };
}

describe("applyDrillRound", () => {
  test("CAS success: inserts DRILL answers with Drill.format and updates remaining via nextRemaining", async () => {
    const { tx, mock, drillUpdateMany, drillWordFindMany } = makeTx(["w1", "w2"]);
    drillUpdateMany.mockResolvedValueOnce({ count: 1 });
    mock.drill.findFirst.mockResolvedValueOnce({
      format: "CHOICE",
      completedAt: null,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
    });
    mock.quizAnswer.createMany.mockResolvedValueOnce({ count: 2 });
    drillWordFindMany.mockResolvedValueOnce([
      { wordId: "w1", remaining: 1 },
      { wordId: "w2", remaining: 2 },
    ]);

    const result = await applyDrillRound(tx, "u1", {
      drillId: "d1",
      expectedRoundCount: 0,
      answers: [
        { wordId: "w1", result: "CORRECT" },
        { wordId: "w2", result: "INCORRECT" },
      ],
    });

    expect(drillUpdateMany).toHaveBeenCalledWith({
      where: { id: "d1", ownerId: "u1", roundCount: 0 },
      data: { roundCount: { increment: 1 } },
    });
    expect(mock.quizAnswer.createMany).toHaveBeenCalledWith({
      data: [
        { ownerId: "u1", wordId: "w1", mode: "DRILL", format: "CHOICE", result: "CORRECT" },
        { ownerId: "u1", wordId: "w2", mode: "DRILL", format: "CHOICE", result: "INCORRECT" },
      ],
    });
    expect(mock.drillWord.update).toHaveBeenCalledWith({
      where: { drillId_wordId: { drillId: "d1", wordId: "w1" } },
      data: { remaining: 0 },
    });
    expect(mock.drillWord.update).toHaveBeenCalledWith({
      where: { drillId_wordId: { drillId: "d1", wordId: "w2" } },
      data: { remaining: 3 },
    });
    // 未完了のため completedAt は設定しない
    expect(mock.drill.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      remaining: [
        { wordId: "w1", remaining: 0 },
        { wordId: "w2", remaining: 3 },
      ],
      completed: false,
      alreadyApplied: false,
    });
  });

  test("CAS success: remaining transitions use the Drill's stored remaining config", async () => {
    const { tx, mock, drillUpdateMany, drillWordFindMany } = makeTx(["w1", "w2"]);
    drillUpdateMany.mockResolvedValueOnce({ count: 1 });
    // この drill は誤答=5 / うろ覚え=4 の設定で生成されている
    mock.drill.findFirst.mockResolvedValueOnce({
      format: "CHOICE",
      completedAt: null,
      resetRemaining: 5,
      vagueRemaining: 4,
      initialCorrectRemaining: 2,
    });
    mock.quizAnswer.createMany.mockResolvedValueOnce({ count: 2 });
    drillWordFindMany.mockResolvedValueOnce([
      { wordId: "w1", remaining: 1 },
      { wordId: "w2", remaining: 3 },
    ]);

    await applyDrillRound(tx, "u1", {
      drillId: "d1",
      expectedRoundCount: 0,
      answers: [
        { wordId: "w1", result: "INCORRECT" }, // → resetRemaining=5
        { wordId: "w2", result: "VAGUE" }, // → vagueRemaining=4
      ],
    });

    expect(mock.drillWord.update).toHaveBeenCalledWith({
      where: { drillId_wordId: { drillId: "d1", wordId: "w1" } },
      data: { remaining: 5 },
    });
    expect(mock.drillWord.update).toHaveBeenCalledWith({
      where: { drillId_wordId: { drillId: "d1", wordId: "w2" } },
      data: { remaining: 4 },
    });
  });

  test("CAS success: sets completedAt when all remaining reach 0", async () => {
    const { tx, mock, drillUpdateMany, drillWordFindMany } = makeTx(["w1"]);
    drillUpdateMany.mockResolvedValueOnce({ count: 1 });
    mock.drill.findFirst.mockResolvedValueOnce({
      format: "SELF_JUDGE",
      completedAt: null,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
    });
    mock.quizAnswer.createMany.mockResolvedValueOnce({ count: 1 });
    drillWordFindMany.mockResolvedValueOnce([{ wordId: "w1", remaining: 1 }]);

    const result = await applyDrillRound(tx, "u1", {
      drillId: "d1",
      expectedRoundCount: 2,
      answers: [{ wordId: "w1", result: "CORRECT" }],
    });

    expect(mock.drill.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { completedAt: expect.any(Date) },
    });
    expect(result).toEqual({
      remaining: [{ wordId: "w1", remaining: 0 }],
      completed: true,
      alreadyApplied: false,
    });
  });

  test("CAS success: deleted word is skipped for both answer insert and remaining update", async () => {
    // w2 は削除済み（word.findMany に現れない → insertQuizAnswers が skip）
    const { tx, mock, drillUpdateMany, drillWordFindMany } = makeTx(["w1"]);
    drillUpdateMany.mockResolvedValueOnce({ count: 1 });
    mock.drill.findFirst.mockResolvedValueOnce({
      format: "CHOICE",
      completedAt: null,
      resetRemaining: 3,
      vagueRemaining: 2,
      initialCorrectRemaining: 1,
    });
    mock.quizAnswer.createMany.mockResolvedValueOnce({ count: 1 });
    drillWordFindMany.mockResolvedValueOnce([
      { wordId: "w1", remaining: 2 },
      { wordId: "w2", remaining: 3 },
    ]);

    const result = await applyDrillRound(tx, "u1", {
      drillId: "d1",
      expectedRoundCount: 0,
      answers: [
        { wordId: "w1", result: "CORRECT" },
        { wordId: "w2", result: "CORRECT" },
      ],
    });

    expect(mock.quizAnswer.createMany).toHaveBeenCalledWith({
      data: [{ ownerId: "u1", wordId: "w1", mode: "DRILL", format: "CHOICE", result: "CORRECT" }],
    });
    expect(mock.drillWord.update).toHaveBeenCalledTimes(1);
    expect(mock.drillWord.update).toHaveBeenCalledWith({
      where: { drillId_wordId: { drillId: "d1", wordId: "w1" } },
      data: { remaining: 1 },
    });
    expect(result.remaining).toEqual([
      { wordId: "w1", remaining: 1 },
      { wordId: "w2", remaining: 3 },
    ]);
  });

  test("CAS miss with roundCount = expected + 1: returns alreadyApplied with current remaining", async () => {
    const { tx, mock, drillWordFindMany } = makeTx([]);
    mock.drill.findFirst.mockResolvedValueOnce({ roundCount: 3, completedAt: null });
    drillWordFindMany.mockResolvedValueOnce([
      { wordId: "w1", remaining: 0 },
      { wordId: "w2", remaining: 2 },
    ]);

    const result = await applyDrillRound(tx, "u1", {
      drillId: "d1",
      expectedRoundCount: 2,
      answers: [{ wordId: "w1", result: "CORRECT" }],
    });

    expect(mock.quizAnswer.createMany).not.toHaveBeenCalled();
    expect(mock.drillWord.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      remaining: [
        { wordId: "w1", remaining: 0 },
        { wordId: "w2", remaining: 2 },
      ],
      completed: false,
      alreadyApplied: true,
    });
  });

  test("CAS miss with roundCount advanced by 2+: throws DrillRoundConflictError", async () => {
    const { tx, mock } = makeTx([]);
    mock.drill.findFirst.mockResolvedValueOnce({ roundCount: 4, completedAt: null });

    await expect(
      applyDrillRound(tx, "u1", { drillId: "d1", expectedRoundCount: 2, answers: [] }),
    ).rejects.toBeInstanceOf(DrillRoundConflictError);
    expect(mock.quizAnswer.createMany).not.toHaveBeenCalled();
  });

  test("CAS miss with missing drill: throws DrillNotFoundError", async () => {
    const { tx } = makeTx([]); // mock.drill.findFirst は既定で null

    await expect(
      applyDrillRound(tx, "u1", { drillId: "missing", expectedRoundCount: 0, answers: [] }),
    ).rejects.toBeInstanceOf(DrillNotFoundError);
  });
});
