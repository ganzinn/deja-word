import { describe, expect, test } from "vitest";

import { buildChoiceQuestions } from "@/lib/quiz/generation/choice";
import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import type { QuizSourceMaterial, QuizWord } from "@/lib/quiz/generation/material";
import { seededRng } from "../../../../tests/setup/seeded-rng";

function word(
  id: string,
  meaningTexts: string[][],
  options: { audio?: string | null } = {},
): QuizWord {
  return {
    id,
    headword: `hw-${id}`,
    tgExample: null,
    meanings: meaningTexts.map((texts, i) => ({
      partOfSpeech: null,
      pronunciationAudioUrl: i === 0 ? (options.audio ?? null) : null,
      texts,
    })),
  };
}

function material(partial: Partial<QuizSourceMaterial>): QuizSourceMaterial {
  return { targets: [], sameOccurrencePool: [], allWordsPool: [], ...partial };
}

describe("buildChoiceQuestions", () => {
  test("builds a 4-choice question: correct text joins first-meaning texts with '; '", () => {
    const target = word("t", [["走る", "駆ける"], ["走行"]], { audio: "https://audio/t" });
    const m = material({
      targets: [target],
      sameOccurrencePool: [word("d1", [["歩く"]]), word("d2", [["泳ぐ"]]), word("d3", [["飛ぶ"]])],
    });
    const [q] = buildChoiceQuestions(m, seededRng(1), false);
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("hw-t");
    // 非 TG 形式の鳴らす対象は従来どおり見出し語（音源＝最初の Meaning、読み上げ＝headword）
    expect(q.pronunciationAudioUrl).toBe("https://audio/t");
    expect(q.ttsText).toBe("hw-t");
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.correctIndex].text).toBe("走る; 駆ける");
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect([...dummyTexts].sort()).toEqual(["歩く", "泳ぐ", "飛ぶ"]);
  });

  test("displays only the first meaning of dummy words as well", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["歩く", "歩む"], ["徒歩"]])],
    });
    const [q] = buildChoiceQuestions(m, seededRng(1), false);
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toEqual(["歩く; 歩む"]);
  });

  test("prefers the primary pool (targets + same occurrence) over the all-words pool", () => {
    const m = material({
      targets: [word("t", [["走る"]]), word("o1", [["読む"]])],
      sameOccurrencePool: [word("o2", [["書く"]]), word("o3", [["聞く"]])],
      allWordsPool: [word("f1", [["話す"]])],
    });
    const questions = buildChoiceQuestions(m, seededRng(1), false);
    const q = questions.find((x) => x.wordId === "t");
    expect(q).toBeDefined();
    const dummyTexts = q!.choices.filter((_, i) => i !== q!.correctIndex).map((c) => c.text);
    expect([...dummyTexts].sort()).toEqual(["聞く", "読む", "書く"].sort());
  });

  test("supplements the shortfall from the all-words pool", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("o1", [["読む"]])],
      allWordsPool: [word("f1", [["話す"]]), word("f2", [["聞く"]])],
    });
    const [q] = buildChoiceQuestions(m, seededRng(1), false);
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toContain("読む");
    expect(dummyTexts).toHaveLength(3);
  });

  test("excludes dummies whose displayed text trim-matches any meaning text of the target", () => {
    // 正解単語の 2 つ目の Meaning「走る」と trim 後一致するダミーは除外される
    const m = material({
      targets: [word("t", [["駆ける"], ["走る"]])],
      sameOccurrencePool: [word("d1", [[" 走る "]]), word("d2", [["歩く"]])],
    });
    const [q] = buildChoiceQuestions(m, seededRng(1), false);
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toEqual(["歩く"]);
  });

  test("degrades below 4 choices but keeps at least 2 (1 dummy)", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["歩く"]])],
    });
    const [q] = buildChoiceQuestions(m, seededRng(1), false);
    expect(q.choices).toHaveLength(2);
    expect(q.choices[q.correctIndex].text).toBe("走る");
  });

  test("throws QuizGenerationError when no dummy is available", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["走る"]])],
    });
    expect(() => buildChoiceQuestions(m, seededRng(1), false)).toThrow(QuizGenerationError);
  });

  test("covers every target exactly once in shuffled question order, deterministically", () => {
    const targets = [
      word("t1", [["一"]]),
      word("t2", [["二"]]),
      word("t3", [["三"]]),
      word("t4", [["四"]]),
      word("t5", [["五"]]),
    ];
    const m = material({ targets });
    const first = buildChoiceQuestions(m, seededRng(42), false);
    const second = buildChoiceQuestions(m, seededRng(42), false);
    expect(first.map((q) => q.wordId)).toEqual(second.map((q) => q.wordId));
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  test("pronunciationAudioUrl is null when the first meaning has no audio", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["歩く"]])],
    });
    const [q] = buildChoiceQuestions(m, seededRng(1), false);
    expect(q.pronunciationAudioUrl).toBeNull();
    expect(q.ttsText).toBe("hw-t");
  });

  describe("firstMeaningTextOnly = true", () => {
    test("shows only the first translation of correct and dummies (no '; ')", () => {
      const m = material({
        targets: [word("t", [["走る", "駆ける"], ["走行"]])],
        sameOccurrencePool: [
          word("d1", [["歩く", "歩む"]]),
          word("d2", [["泳ぐ"]]),
          word("d3", [["飛ぶ"]]),
        ],
      });
      const [q] = buildChoiceQuestions(m, seededRng(1), true);
      expect(q.choices[q.correctIndex].text).toBe("走る");
      for (const c of q.choices) expect(c.text).not.toContain("; ");
      const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
      expect([...dummyTexts].sort()).toEqual(["歩く", "泳ぐ", "飛ぶ"].sort());
    });

    test("does not render two choices identical after truncation to the first translation", () => {
      // 「走る; 駆ける」と「走る; 急ぐ」はどちらも先頭訳語が「走る」。重複排除キーを先頭訳語に
      // 縮めることで、見た目が同一の選択肢が生じない（正解と重複しないことも確認）。
      const m = material({
        targets: [word("t", [["走る", "駆ける"]])],
        sameOccurrencePool: [word("d1", [["走る", "急ぐ"]]), word("d2", [["歩く"]])],
      });
      const [q] = buildChoiceQuestions(m, seededRng(1), true);
      const texts = q.choices.map((c) => c.text);
      expect(new Set(texts).size).toBe(texts.length);
      const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
      expect(dummyTexts).toEqual(["歩く"]);
    });
  });

  // 結果一覧の正解列は設定に依らず全訳語を出す（ADR-0101）。選択肢の絞り込みと独立していることを見る
  test.each([false, true])(
    "correctMeaningTexts is the first meaning's texts in order (firstMeaningTextOnly = %s)",
    (firstMeaningTextOnly) => {
      const m = material({
        targets: [word("t", [["走る", "駆ける"], ["走行"]])],
        sameOccurrencePool: [
          word("d1", [["歩く"]]),
          word("d2", [["泳ぐ"]]),
          word("d3", [["飛ぶ"]]),
        ],
      });
      const [q] = buildChoiceQuestions(m, seededRng(1), firstMeaningTextOnly);
      expect(q.correctMeaningTexts).toEqual(["走る", "駆ける"]);
    },
  );

  test("correctMeaningTexts is empty for a word without meanings", () => {
    const m = material({
      targets: [word("t", [])],
      sameOccurrencePool: [word("d1", [["歩く"]]), word("d2", [["泳ぐ"]])],
    });
    const [q] = buildChoiceQuestions(m, seededRng(1), false);
    expect(q.correctMeaningTexts).toEqual([]);
  });
});
