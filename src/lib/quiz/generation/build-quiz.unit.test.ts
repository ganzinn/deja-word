import { describe, expect, test } from "vitest";

import { buildQuiz, checkFormatAvailability } from "@/lib/quiz/generation/build-quiz";
import type { QuizSourceMaterial, QuizWord } from "@/lib/quiz/generation/material";
import { seededRng } from "../../../../tests/setup/seeded-rng";

function word(id: string, meaningTexts: string[][]): QuizWord {
  return {
    id,
    headword: `hw-${id}`,
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

const richMaterial = material({
  targets: [word("t1", [["走る", "駆ける"], ["経営する"]]), word("t2", [["歩く"]])],
  sameOccurrencePool: [word("d1", [["読む"]]), word("d2", [["書く"]]), word("d3", [["聞く"]])],
});

describe("buildQuiz", () => {
  test("dispatches to the matching generator per format (discriminated payload)", () => {
    const choice = buildQuiz("CHOICE", richMaterial, seededRng(1));
    expect(choice.format).toBe("CHOICE");
    expect(choice.questions).toHaveLength(2);
    if (choice.format === "CHOICE") {
      expect(choice.questions[0].choices.length).toBeGreaterThanOrEqual(2);
    }

    const selfJudge = buildQuiz("SELF_JUDGE", richMaterial, seededRng(1));
    expect(selfJudge.format).toBe("SELF_JUDGE");
    expect(selfJudge.questions).toHaveLength(2);
    if (selfJudge.format === "SELF_JUDGE") {
      expect(selfJudge.questions[0].answer.length).toBeGreaterThanOrEqual(1);
    }

    const multi = buildQuiz("MULTI_MEANING", richMaterial, seededRng(1));
    expect(multi.format).toBe("MULTI_MEANING");
    expect(multi.questions).toHaveLength(2);
    if (multi.format === "MULTI_MEANING") {
      expect(multi.questions[0].options.some((o) => o.isCorrect)).toBe(true);
    }
  });
});

describe("checkFormatAvailability", () => {
  test("is unavailable for every format when there is no target word", () => {
    const empty = material({ allWordsPool: [word("f1", [["甲"]])] });
    for (const format of ["CHOICE", "SELF_JUDGE", "MULTI_MEANING"] as const) {
      const r = checkFormatAvailability(format, empty);
      expect(r.available).toBe(false);
      expect(r.reason).toBe("出題対象の単語がありません");
    }
  });

  test("SELF_JUDGE is available with targets even when no other word exists", () => {
    const m = material({ targets: [word("t", [["走る"]])] });
    expect(checkFormatAvailability("SELF_JUDGE", m)).toEqual({ available: true, reason: null });
    // 一方、ダミーが必要な形式は不成立
    expect(checkFormatAvailability("CHOICE", m).available).toBe(false);
    expect(checkFormatAvailability("MULTI_MEANING", m).available).toBe(false);
  });

  test("CHOICE is unavailable when some target cannot get any dummy (trim-exact collision)", () => {
    const m = material({
      targets: [word("t", [["駆ける"], ["走る"]])],
      sameOccurrencePool: [word("d1", [[" 走る "]])],
    });
    const r = checkFormatAvailability("CHOICE", m);
    expect(r.available).toBe(false);
    expect(r.reason).toContain("hw-t");
  });

  test("CHOICE becomes available when the all-words pool provides a valid dummy", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["走る"]])],
      allWordsPool: [word("f1", [["歩く"]])],
    });
    expect(checkFormatAvailability("CHOICE", m)).toEqual({ available: true, reason: null });
  });

  test("MULTI_MEANING checks collisions against all meaning texts of other words", () => {
    // 他単語の全 MeaningText が正解集合と衝突 → 不成立
    const unavailable = material({
      targets: [word("t", [["走る", "歩く"]])],
      sameOccurrencePool: [word("d1", [["走る"], ["歩く"]])],
    });
    expect(checkFormatAvailability("MULTI_MEANING", unavailable).available).toBe(false);

    // 2 つ目の Meaning に有効なテキストがあれば成立（四択の表示対象は最初の Meaning のみだが、多義語選択は全 Meaning を使える）
    const available = material({
      targets: [word("t", [["走る", "歩く"]])],
      sameOccurrencePool: [word("d1", [["走る"], ["甲"]])],
    });
    expect(checkFormatAvailability("MULTI_MEANING", available)).toEqual({
      available: true,
      reason: null,
    });
  });

  test("availability agrees with generation success for dummy-starved material", () => {
    // 成立判定が false の素材では生成がエラーになり、true の素材では生成が成功する
    const starved = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["走る"]])],
    });
    expect(checkFormatAvailability("CHOICE", starved).available).toBe(false);
    expect(() => buildQuiz("CHOICE", starved, seededRng(1))).toThrow();

    expect(checkFormatAvailability("CHOICE", richMaterial).available).toBe(true);
    expect(() => buildQuiz("CHOICE", richMaterial, seededRng(1))).not.toThrow();
  });
});
