import { describe, expect, test } from "vitest";

import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import type { QuizSourceMaterial, QuizWord } from "@/lib/quiz/generation/material";
import { buildMultiMeaningQuestions } from "@/lib/quiz/generation/multi-meaning";
import type { Rng } from "@/lib/quiz/generation/shuffle";
import { seededRng } from "../../../../tests/setup/seeded-rng";

function word(id: string, meaningTexts: string[][]): QuizWord {
  return {
    id,
    headword: `hw-${id}`,
    tgExample: null,
    meanings: meaningTexts.map((texts) => ({
      partOfSpeech: null,
      pronunciationAudioUrl: null,
      texts,
    })),
  };
}

function material(partial: Partial<QuizSourceMaterial>): QuizSourceMaterial {
  return { targets: [], sameOccurrencePool: [], allWordsPool: [], ...partial };
}

/** 先頭から `values` を返し、使い切ったら 0.5 を返す決定的 RNG。 */
function sequenceRng(values: number[]): Rng {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
}

const amplePool = [
  word("d1", [["甲"]]),
  word("d2", [["乙"]]),
  word("d3", [["丙"]]),
  word("d4", [["丁"]]),
  word("d5", [["戊"]]),
  word("d6", [["己"]]),
];

describe("buildMultiMeaningQuestions", () => {
  test("correct options are the first meaning's texts only, merged after trim", () => {
    const target = word("t", [
      ["走る", " 走る ", "駆ける"],
      ["経営する"], // 別品詞の Meaning は正解に含めない
    ]);
    const m = material({ targets: [target], sameOccurrencePool: amplePool });
    const [q] = buildMultiMeaningQuestions(m, seededRng(1));
    const correct = q.options.filter((o) => o.isCorrect).map((o) => o.text);
    expect([...correct].sort()).toEqual(["走る", "駆ける"].sort());
    // 非 TG 形式の鳴らす対象は従来どおり見出し語（音源＝最初の Meaning、読み上げ＝headword）
    expect(q.pronunciationAudioUrl).toBeNull();
    expect(q.ttsText).toBe("hw-t");
  });

  test("dummies never collide with a non-first meaning of the target", () => {
    const target = word("t", [["走る"], ["経営する"]]);
    const m = material({
      targets: [target],
      sameOccurrencePool: [word("d1", [["経営する"], ["甲"]])],
    });
    const [q] = buildMultiMeaningQuestions(m, sequenceRng([0.999]));
    const dummyTexts = q.options.filter((o) => !o.isCorrect).map((o) => o.text);
    expect(dummyTexts).not.toContain("経営する");
    expect([...dummyTexts].sort()).toEqual(["甲"]);
  });

  test("dummy count is 2 when rng yields its minimum, 5 at its maximum", () => {
    const target = word("t", [["走る"]]);
    const m = material({ targets: [target], sameOccurrencePool: amplePool });
    const dummiesWith = (value: number) => {
      const [q] = buildMultiMeaningQuestions(m, sequenceRng([value]));
      return q.options.filter((o) => !o.isCorrect);
    };
    expect(dummiesWith(0)).toHaveLength(2);
    expect(dummiesWith(0.999)).toHaveLength(5);
  });

  test("dummy count stays within 2..5 across seeds", () => {
    const m = material({ targets: [word("t", [["走る"]])], sameOccurrencePool: amplePool });
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const [q] = buildMultiMeaningQuestions(m, seededRng(seed));
      const dummyCount = q.options.filter((o) => !o.isCorrect).length;
      expect(dummyCount).toBeGreaterThanOrEqual(2);
      expect(dummyCount).toBeLessThanOrEqual(5);
    }
  });

  test("draws dummies from all meanings of other words (multiple from one word allowed)", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["甲"], ["乙"]])],
    });
    const [q] = buildMultiMeaningQuestions(m, sequenceRng([0.999]));
    const dummyTexts = q.options.filter((o) => !o.isCorrect).map((o) => o.text);
    expect([...dummyTexts].sort()).toEqual(["乙", "甲"]);
  });

  test("excludes dummy texts colliding with the correct set and merges duplicate dummies", () => {
    const m = material({
      targets: [word("t", [["走る", "駆ける"]])],
      sameOccurrencePool: [
        word("d1", [[" 走る ", "甲"]]), // 「走る」は正解と衝突して除外、「甲」は有効
        word("d2", [["甲", "乙"]]), // 「甲」はダミー同士で重複統合
      ],
    });
    const [q] = buildMultiMeaningQuestions(m, sequenceRng([0.999]));
    const dummyTexts = q.options.filter((o) => !o.isCorrect).map((o) => o.text);
    expect([...dummyTexts].sort()).toEqual(["乙", "甲"]);
  });

  test("degrades to a single dummy when the pools run short", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      allWordsPool: [word("f1", [["甲"]])],
    });
    const [q] = buildMultiMeaningQuestions(m, seededRng(1));
    expect(q.options.filter((o) => !o.isCorrect)).toHaveLength(1);
    expect(q.options.filter((o) => o.isCorrect).map((o) => o.text)).toEqual(["走る"]);
  });

  test("throws QuizGenerationError when no dummy is available", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["走る"]])],
    });
    expect(() => buildMultiMeaningQuestions(m, seededRng(1))).toThrow(QuizGenerationError);
  });

  test("is deterministic for the same seed and covers every target once", () => {
    const targets = [word("t1", [["一"]]), word("t2", [["二"]]), word("t3", [["三"]])];
    const m = material({ targets, sameOccurrencePool: amplePool });
    const first = buildMultiMeaningQuestions(m, seededRng(42));
    const second = buildMultiMeaningQuestions(m, seededRng(42));
    expect(first).toEqual(second);
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["t1", "t2", "t3"]);
  });
});
