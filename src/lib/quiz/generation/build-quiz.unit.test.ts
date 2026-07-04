import { describe, expect, test } from "vitest";

import { buildQuiz, checkFormatAvailability } from "@/lib/quiz/generation/build-quiz";
import type { QuizSourceMaterial, QuizWord } from "@/lib/quiz/generation/material";
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

/** 使える TG 例文つきの単語（TG四択の素材用）。 */
function tgWord(id: string, meaningTexts: string[][]): QuizWord {
  return { ...word(id, meaningTexts), tgExample: { text: `sentence ${id}`, meaning: `例文${id}` } };
}

function material(partial: Partial<QuizSourceMaterial>): QuizSourceMaterial {
  return { targets: [], sameOccurrencePool: [], allWordsPool: [], ...partial };
}

const richMaterial = material({
  targets: [word("t1", [["走る", "駆ける"], ["経営する"]]), word("t2", [["歩く"]])],
  sameOccurrencePool: [word("d1", [["読む"]]), word("d2", [["書く"]]), word("d3", [["聞く"]])],
});

const richTgMaterial = material({
  targets: [tgWord("t1", [["走る"]]), tgWord("t2", [["歩く"]])],
  sameOccurrencePool: [tgWord("d1", [["読む"]]), tgWord("d2", [["書く"]])],
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

    const choiceJaEn = buildQuiz("CHOICE_JA_EN", richMaterial, seededRng(1));
    expect(choiceJaEn.format).toBe("CHOICE_JA_EN");
    expect(choiceJaEn.questions).toHaveLength(2);
    if (choiceJaEn.format === "CHOICE_JA_EN") {
      const q = choiceJaEn.questions[0];
      expect(typeof q.prompt).toBe("string");
      expect(q.prompt.length).toBeGreaterThanOrEqual(1);
      // 選択肢は英単語（headword）で、正解は target の headword
      expect(q.choices[q.correctIndex].text).toBe(q.headword);
    }

    const selfJudgeJaEn = buildQuiz("SELF_JUDGE_JA_EN", richMaterial, seededRng(1));
    expect(selfJudgeJaEn.format).toBe("SELF_JUDGE_JA_EN");
    expect(selfJudgeJaEn.questions).toHaveLength(2);
    if (selfJudgeJaEn.format === "SELF_JUDGE_JA_EN") {
      expect(typeof selfJudgeJaEn.questions[0].prompt).toBe("string");
      expect(selfJudgeJaEn.questions[0].prompt.length).toBeGreaterThanOrEqual(1);
    }

    const spelling = buildQuiz("SPELLING", richMaterial, seededRng(1));
    expect(spelling.format).toBe("SPELLING");
    expect(spelling.questions).toHaveLength(2);
    if (spelling.format === "SPELLING") {
      expect(typeof spelling.questions[0].prompt).toBe("string");
      expect(spelling.questions[0].prompt.length).toBeGreaterThanOrEqual(1);
    }

    const choiceTg = buildQuiz("CHOICE_TG", richTgMaterial, seededRng(1));
    expect(choiceTg.format).toBe("CHOICE_TG");
    expect(choiceTg.questions).toHaveLength(2);
    if (choiceTg.format === "CHOICE_TG") {
      const q = choiceTg.questions[0];
      // 問題文は TG 例文の英文、正解選択肢は TG 例文の意味
      expect(q.prompt).toMatch(/^sentence /);
      expect(q.choices[q.correctIndex].text).toMatch(/^例文/);
    }

    const choiceTgJaEn = buildQuiz("CHOICE_TG_JA_EN", richTgMaterial, seededRng(1));
    expect(choiceTgJaEn.format).toBe("CHOICE_TG_JA_EN");
    expect(choiceTgJaEn.questions).toHaveLength(2);
    if (choiceTgJaEn.format === "CHOICE_TG_JA_EN") {
      const q = choiceTgJaEn.questions[0];
      // 問題文は TG 例文の意味、正解選択肢は TG 例文の英文
      expect(q.prompt).toMatch(/^例文/);
      expect(q.choices[q.correctIndex].text).toMatch(/^sentence /);
    }

    const selfJudgeTg = buildQuiz("SELF_JUDGE_TG", richTgMaterial, seededRng(1));
    expect(selfJudgeTg.format).toBe("SELF_JUDGE_TG");
    expect(selfJudgeTg.questions).toHaveLength(2);
    if (selfJudgeTg.format === "SELF_JUDGE_TG") {
      const q = selfJudgeTg.questions[0];
      // 問題文は TG 例文の英文、解答は TG 例文の意味
      expect(q.prompt).toMatch(/^sentence /);
      expect(q.answer).toMatch(/^例文/);
    }

    const selfJudgeTgJaEn = buildQuiz("SELF_JUDGE_TG_JA_EN", richTgMaterial, seededRng(1));
    expect(selfJudgeTgJaEn.format).toBe("SELF_JUDGE_TG_JA_EN");
    expect(selfJudgeTgJaEn.questions).toHaveLength(2);
    if (selfJudgeTgJaEn.format === "SELF_JUDGE_TG_JA_EN") {
      const q = selfJudgeTgJaEn.questions[0];
      // 問題文は TG 例文の意味、解答は TG 例文の英文
      expect(q.prompt).toMatch(/^例文/);
      expect(q.answer).toMatch(/^sentence /);
    }
  });

  test("forwards choiceFirstMeaningTextOnly to the CHOICE generator", () => {
    // 既定（連結）: t1 の正解は複数訳語を含むので「; 」を含む選択肢が現れる
    const joined = buildQuiz("CHOICE", richMaterial, seededRng(1));
    if (joined.format !== "CHOICE") throw new Error("unreachable");
    expect(joined.questions.some((q) => q.choices.some((c) => c.text.includes("; ")))).toBe(true);

    // ON（先頭訳語のみ）: どの選択肢にも「; 」は現れない
    const firstOnly = buildQuiz("CHOICE", richMaterial, seededRng(1), {
      choiceFirstMeaningTextOnly: true,
    });
    if (firstOnly.format !== "CHOICE") throw new Error("unreachable");
    expect(firstOnly.questions.every((q) => q.choices.every((c) => !c.text.includes("; ")))).toBe(
      true,
    );
  });
});

describe("checkFormatAvailability", () => {
  test("is unavailable for every format when there is no target word", () => {
    const empty = material({ allWordsPool: [word("f1", [["甲"]])] });
    for (const format of [
      "CHOICE",
      "SELF_JUDGE",
      "MULTI_MEANING",
      "CHOICE_JA_EN",
      "SELF_JUDGE_JA_EN",
      "SPELLING",
      "CHOICE_TG",
      "CHOICE_TG_JA_EN",
      "SELF_JUDGE_TG",
      "SELF_JUDGE_TG_JA_EN",
    ] as const) {
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
    expect(checkFormatAvailability("CHOICE_JA_EN", m).available).toBe(false);
  });

  test("self-report formats (SELF_JUDGE_JA_EN / SPELLING) are available with any target", () => {
    const m = material({ targets: [word("t", [["走る"]])] });
    expect(checkFormatAvailability("SELF_JUDGE_JA_EN", m)).toEqual({
      available: true,
      reason: null,
    });
    expect(checkFormatAvailability("SPELLING", m)).toEqual({ available: true, reason: null });
  });

  test("CHOICE_JA_EN dummy availability is judged by headword, independent of meanings", () => {
    // 意味は衝突しても headword が異なれば成立（向きが逆なので正解側は headword）
    const ok = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["走る"]])],
    });
    expect(checkFormatAvailability("CHOICE_JA_EN", ok)).toEqual({ available: true, reason: null });
    // headword 単独（ダミーなし）では不成立
    const starved = material({ targets: [word("t", [["走る"]])] });
    const r = checkFormatAvailability("CHOICE_JA_EN", starved);
    expect(r.available).toBe(false);
    expect(r.reason).toContain("hw-t");
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

  test("TG formats are unavailable when no target has a usable TG example", () => {
    // 出題対象はあるが、どれも使える TG 例文を持たない（四択・自己判定とも同じ理由で不成立）
    const m = material({
      targets: [word("t1", [["走る"]])],
      sameOccurrencePool: [tgWord("d1", [["読む"]])],
    });
    for (const format of [
      "CHOICE_TG",
      "CHOICE_TG_JA_EN",
      "SELF_JUDGE_TG",
      "SELF_JUDGE_TG_JA_EN",
    ] as const) {
      const r = checkFormatAvailability(format, m);
      expect(r.available).toBe(false);
      expect(r.reason).toBe("TG例文（意味つき）が登録された出題対象の単語がありません");
    }
  });

  test("TG self-judge formats are available without any dummy word (unlike TG choice)", () => {
    // 自己判定はダミー不要のため、TG 例文つきの出題対象が 1 件あれば成立する
    const m = material({ targets: [tgWord("t", [["走る"]])] });
    expect(checkFormatAvailability("SELF_JUDGE_TG", m)).toEqual({ available: true, reason: null });
    expect(checkFormatAvailability("SELF_JUDGE_TG_JA_EN", m)).toEqual({
      available: true,
      reason: null,
    });
    // 一方、TG四択はダミーを確保できず不成立
    expect(checkFormatAvailability("CHOICE_TG", m).available).toBe(false);
  });

  test("TG choice availability requires a TG-example dummy (words without TG don't count)", () => {
    // ダミー候補は TG 例文つきの単語のみ。TG なし単語しか無ければ不成立
    const starved = material({
      targets: [tgWord("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["読む"]])],
    });
    const r = checkFormatAvailability("CHOICE_TG", starved);
    expect(r.available).toBe(false);
    expect(r.reason).toContain("hw-t");
    // 補完プールに TG 例文つきの単語があれば成立
    const ok = material({
      targets: [tgWord("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["読む"]])],
      allWordsPool: [tgWord("f1", [["話す"]])],
    });
    expect(checkFormatAvailability("CHOICE_TG", ok)).toEqual({ available: true, reason: null });
    expect(checkFormatAvailability("CHOICE_TG_JA_EN", ok)).toEqual({
      available: true,
      reason: null,
    });
  });

  test("TG formats are available for a target with no word meanings (meanings: [])", () => {
    // 単語自身の意味が未登録でも、使える TG 例文があれば TG 四択は成立・生成できる。
    const meaninglessTarget: QuizWord = {
      id: "mt",
      headword: "hw-mt",
      tgExample: { text: "sentence mt", meaning: "例文mt" },
      meanings: [],
    };
    const m = material({
      targets: [meaninglessTarget],
      sameOccurrencePool: [
        tgWord("d1", [["読む"]]),
        tgWord("d2", [["書く"]]),
        tgWord("d3", [["話す"]]),
      ],
    });
    expect(checkFormatAvailability("CHOICE_TG", m)).toEqual({ available: true, reason: null });
    expect(checkFormatAvailability("CHOICE_TG_JA_EN", m)).toEqual({
      available: true,
      reason: null,
    });
    expect(() => buildQuiz("CHOICE_TG", m, seededRng(1))).not.toThrow();
    expect(() => buildQuiz("CHOICE_TG_JA_EN", m, seededRng(1))).not.toThrow();
    expect(checkFormatAvailability("SELF_JUDGE_TG", m)).toEqual({ available: true, reason: null });
    expect(checkFormatAvailability("SELF_JUDGE_TG_JA_EN", m)).toEqual({
      available: true,
      reason: null,
    });
    expect(() => buildQuiz("SELF_JUDGE_TG", m, seededRng(1))).not.toThrow();
    expect(() => buildQuiz("SELF_JUDGE_TG_JA_EN", m, seededRng(1))).not.toThrow();
  });

  test("availability agrees with generation success for TG material", () => {
    const noTgTargets = material({
      targets: [word("t1", [["走る"]])],
      sameOccurrencePool: [tgWord("d1", [["読む"]])],
    });
    expect(checkFormatAvailability("CHOICE_TG", noTgTargets).available).toBe(false);
    expect(() => buildQuiz("CHOICE_TG", noTgTargets, seededRng(1))).toThrow();
    expect(checkFormatAvailability("SELF_JUDGE_TG", noTgTargets).available).toBe(false);
    expect(() => buildQuiz("SELF_JUDGE_TG", noTgTargets, seededRng(1))).toThrow();
    expect(checkFormatAvailability("SELF_JUDGE_TG_JA_EN", noTgTargets).available).toBe(false);
    expect(() => buildQuiz("SELF_JUDGE_TG_JA_EN", noTgTargets, seededRng(1))).toThrow();

    expect(checkFormatAvailability("CHOICE_TG", richTgMaterial).available).toBe(true);
    expect(() => buildQuiz("CHOICE_TG", richTgMaterial, seededRng(1))).not.toThrow();
    expect(checkFormatAvailability("CHOICE_TG_JA_EN", richTgMaterial).available).toBe(true);
    expect(() => buildQuiz("CHOICE_TG_JA_EN", richTgMaterial, seededRng(1))).not.toThrow();
    expect(checkFormatAvailability("SELF_JUDGE_TG", richTgMaterial).available).toBe(true);
    expect(() => buildQuiz("SELF_JUDGE_TG", richTgMaterial, seededRng(1))).not.toThrow();
    expect(checkFormatAvailability("SELF_JUDGE_TG_JA_EN", richTgMaterial).available).toBe(true);
    expect(() => buildQuiz("SELF_JUDGE_TG_JA_EN", richTgMaterial, seededRng(1))).not.toThrow();
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
