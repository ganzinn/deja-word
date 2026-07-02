import { describe, expect, test } from "vitest";

import { createDrillForUser } from "@/lib/drill-create";
import { generateDrillRoundForUser } from "@/lib/drill-round-generate";

import { createOccurrenceRow, createQuizWordRow, createTestUser } from "../../tests/setup/fixtures";

/** 番号付き単語＋drill を一式作る（drill-retry-generate.integration.test.ts と同形）。 */
async function setupDrill(
  words: { headword: string; number: number; correct: boolean }[],
  options: {
    timeoutSeconds?: number | null;
    sourceRangeFrom?: number;
    sourceRangeTo?: number;
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
      format: "SELF_JUDGE",
      timeoutSeconds: 7,
      choiceFirstMeaningTextOnly: false,
    });
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
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    });
  });
});
