import { describe, expect, test } from "vitest";

import { createDrillForUser } from "@/lib/drill-create";
import { DrillNoAskableWordsError, generateDrillRoundForUser } from "@/lib/drill-round-generate";
import { submitDrillRoundForUser } from "@/lib/drill-round-submit";
import { prisma } from "@/lib/prisma";

import { createOccurrenceRow, createQuizWordRow, createTestUser } from "../../tests/setup/fixtures";

/** 番号付き単語＋drill を一式作る（drill-retry-generate.integration.test.ts と同形）。 */
async function setupDrill(
  words: { headword: string; number: number; correct: boolean }[],
  options: {
    timeoutSeconds?: number | null;
    sourceRangeFrom?: number;
    sourceRangeTo?: number;
    sourceQuestionCount?: number;
    orderByOccurrenceNumber?: boolean;
    firstMeaningTextOnly?: boolean;
  } = {},
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
    sourceRangeFrom: options.sourceRangeFrom,
    sourceRangeTo: options.sourceRangeTo,
    sourceQuestionCount: options.sourceQuestionCount,
    format: "SELF_JUDGE",
    timeoutSeconds: options.timeoutSeconds ?? null,
    firstMeaningTextOnly: options.firstMeaningTextOnly ?? false,
    orderByOccurrenceNumber: options.orderByOccurrenceNumber,
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

describe("generateDrillRoundForUser", () => {
  test("sourceTest reflects the Drill row (occurrenceId / sourceRange / format / timeout / choice option)", async () => {
    const { user, occurrence, drillId } = await setupDrill(
      [
        { headword: "alpha", number: 5, correct: false },
        { headword: "beta", number: 12, correct: false },
      ],
      { timeoutSeconds: 7, sourceRangeFrom: 1, sourceRangeTo: 100 },
    );

    const { quiz, sourceTest, occurrenceName } = await generateDrillRoundForUser(user.id, {
      drillId,
    });
    expect(quiz.format).toBe("SELF_JUDGE");
    // 完了画面の範囲表示用の掲載箇所名
    expect(occurrenceName).toBe("本A");
    // 元テストの開始入力: 実効範囲（誤答の min/max = 5..12）ではなく保存した元範囲を返す
    expect(sourceTest).toEqual({
      occurrenceId: occurrence.id,
      rangeFrom: 1,
      rangeTo: 100,
      // 元テストの「ブックマークのみ」指定（Drill.sourceBookmarkedOnly の既定 false）
      bookmarkedOnly: false,
      format: "SELF_JUDGE",
      timeoutSeconds: 7,
      firstMeaningTextOnly: false,
      // 元テストの「掲載番号順に出題する」指定（Drill.orderByOccurrenceNumber の既定 false）
      orderByOccurrenceNumber: false,
    });
  });

  test("sourceQuestionCount は Drill に保存され sourceTest.questionCount として復元される（ADR-0074）", async () => {
    const { user, drillId } = await setupDrill(
      [
        { headword: "alpha", number: 5, correct: false },
        { headword: "beta", number: 12, correct: false },
      ],
      { sourceQuestionCount: 20 },
    );

    const { sourceTest } = await generateDrillRoundForUser(user.id, { drillId });
    // 再テスト（「同じ範囲でもう一度テストする」）が同じ出題数で再抽選するための引き継ぎ。
    expect(sourceTest.questionCount).toBe(20);
  });

  test("drill 行に保存済みの firstMeaningTextOnly は変換されずそのままラウンド生成へ流れる", async () => {
    // 列名の改名は RENAME COLUMN のみで、データ移行・backfill をしない
    // （02-settings-model.md 決定 6）。保存値がそのまま引き継がれることをここで担保する。
    const { user, drillId } = await setupDrill(
      [
        { headword: "alpha", number: 5, correct: false },
        { headword: "beta", number: 12, correct: false },
      ],
      { firstMeaningTextOnly: true },
    );
    // drill 行に true が保存されている（既定 false と区別できる値）
    const drill = await prisma.drill.findUniqueOrThrow({ where: { id: drillId } });
    expect(drill.firstMeaningTextOnly).toBe(true);

    const { sourceTest } = await generateDrillRoundForUser(user.id, { drillId });
    expect(sourceTest.firstMeaningTextOnly).toBe(true);
  });

  test("NULL sourceRange (source test had no range) maps to undefined rangeFrom/rangeTo", async () => {
    const { user, occurrence, drillId } = await setupDrill([
      { headword: "alpha", number: 5, correct: false },
    ]);

    const { sourceTest } = await generateDrillRoundForUser(user.id, { drillId });
    expect(sourceTest).toEqual({
      occurrenceId: occurrence.id,
      rangeFrom: undefined,
      rangeTo: undefined,
      // 元テストの「ブックマークのみ」指定（Drill.sourceBookmarkedOnly の既定 false）
      bookmarkedOnly: false,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      firstMeaningTextOnly: false,
      // 元テストの「掲載番号順に出題する」指定（Drill.orderByOccurrenceNumber の既定 false）
      orderByOccurrenceNumber: false,
    });
  });

  test("掲載番号順の drill はラウンドを繰り返しても掲載番号の昇順で出題する（ADR-0039 の例外）", async () => {
    // 登録順（＝ DrillWord の作成順）と掲載番号順が一致しないようにする
    const { user, drillId, wordIds } = await setupDrill(
      [
        { headword: "epsilon", number: 50, correct: false },
        { headword: "delta", number: 40, correct: false },
        { headword: "gamma", number: 30, correct: false },
        { headword: "beta", number: 20, correct: false },
        { headword: "alpha", number: 10, correct: false },
      ],
      { orderByOccurrenceNumber: true },
    );
    const ascending = [...wordIds].reverse();

    // 再生成しても毎回同じ昇順（＝ラウンドごとの再シャッフルをしない）
    for (let round = 0; round < 3; round++) {
      const { quiz } = await generateDrillRoundForUser(user.id, { drillId });
      expect(quiz.questions.map((q) => q.wordId)).toEqual(ascending);
    }
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

    const { quiz } = await generateDrillRoundForUser(user.id, { drillId });
    // 範囲外へ移動しても未定着メンバーは出題され続ける（完了不能化しない。issue #106）
    expect(quiz.questions.map((q) => q.wordId).sort()).toEqual([...wordIds].sort());
    // 出題可能なままのため自己修復削除（ADR-0067）の対象にもならない
    expect(await prisma.drillWord.count({ where: { drillId } })).toBe(2);
  });

  test("a member whose occurrenceNumber became null is deleted from the drill (self-healing, ADR-0067)", async () => {
    const { user, occurrence, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 5, correct: false },
      { headword: "beta", number: 12, correct: false },
    ]);
    // beta の番号付きリンクを失わせる（番号 null 化）
    await prisma.wordOccurrence.updateMany({
      where: { wordId: wordIds[1], occurrenceId: occurrence.id },
      data: { occurrenceNumber: null },
    });

    const { quiz } = await generateDrillRoundForUser(user.id, { drillId });
    // 番号付きリンク自体を失ったメンバーは出題されず、DrillWord 行ごと削除される
    expect(quiz.questions.map((q) => q.wordId)).toEqual([wordIds[0]]);
    const rows = await prisma.drillWord.findMany({ where: { drillId }, select: { wordId: true } });
    expect(rows.map((r) => r.wordId)).toEqual([wordIds[0]]);
  });

  test("a member whose meanings were all deleted is deleted from the drill (self-healing, ADR-0067)", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 5, correct: false },
      { headword: "beta", number: 12, correct: false },
    ]);
    // beta の意味を全削除 → 非 TG 形式の形式適格（可視 MeaningText 1 件以上）を失う
    await prisma.meaning.deleteMany({ where: { wordId: wordIds[1] } });

    const { quiz } = await generateDrillRoundForUser(user.id, { drillId });
    // 出題不能化したメンバーは出題されず、DrillWord 行ごと削除される。生き残りは出題され続ける
    expect(quiz.questions.map((q) => q.wordId)).toEqual([wordIds[0]]);
    const rows = await prisma.drillWord.findMany({ where: { drillId }, select: { wordId: true } });
    expect(rows.map((r) => r.wordId)).toEqual([wordIds[0]]);
  });

  test("drill remains completable after self-healing: surviving member is retained and completedAt is set (issue #106)", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 5, correct: false },
      { headword: "beta", number: 12, correct: false },
    ]);
    await prisma.meaning.deleteMany({ where: { wordId: wordIds[1] } });

    // 誤答投入の残数は resetRemaining=3 → 生き残りメンバーを正解 3 ラウンドで定着できる
    let completed = false;
    for (let round = 0; round < 3; round++) {
      const { quiz, roundCount } = await generateDrillRoundForUser(user.id, { drillId });
      expect(quiz.questions.map((q) => q.wordId)).toEqual([wordIds[0]]);
      const result = await submitDrillRoundForUser(user.id, {
        drillId,
        expectedRoundCount: roundCount,
        answers: quiz.questions.map((q) => ({ wordId: q.wordId, result: "CORRECT" as const })),
      });
      completed = result.completed;
    }

    expect(completed).toBe(true);
    const drill = await prisma.drill.findUniqueOrThrow({ where: { id: drillId } });
    expect(drill.completedAt).not.toBeNull();
  });

  test("all unfinished members unaskable: rows deleted, completedAt set, DrillNoAskableWordsError thrown (ADR-0067)", async () => {
    const { user, drillId, wordIds } = await setupDrill([
      { headword: "alpha", number: 5, correct: false },
    ]);
    // 唯一の未定着メンバーが意味の全削除で出題不能化する
    await prisma.meaning.deleteMany({ where: { wordId: wordIds[0] } });

    // 返せるラウンドが無いため throw（action 層で「完了になりました」の Result に変換される）
    await expect(generateDrillRoundForUser(user.id, { drillId })).rejects.toBeInstanceOf(
      DrillNoAskableWordsError,
    );
    // DrillWord 行は削除され、送信側完了判定の鏡像として completedAt が設定される
    expect(await prisma.drillWord.count({ where: { drillId } })).toBe(0);
    const drill = await prisma.drill.findUniqueOrThrow({ where: { id: drillId } });
    expect(drill.completedAt).not.toBeNull();
  });
});
