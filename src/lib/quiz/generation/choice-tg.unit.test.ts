import { describe, expect, test } from "vitest";

import { buildChoiceTgQuestions, NO_TG_TARGET_REASON } from "@/lib/quiz/generation/choice-tg";
import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import type { QuizSourceMaterial, QuizWord } from "@/lib/quiz/generation/material";
import { seededRng } from "../../../../tests/setup/seeded-rng";

function word(
  id: string,
  tgExample: { text: string; meaning: string } | null,
  options: { audio?: string | null } = {},
): QuizWord {
  return {
    id,
    headword: `hw-${id}`,
    tgExample,
    meanings: [
      {
        partOfSpeech: null,
        pronunciationAudioUrl: options.audio ?? null,
        texts: [`${id}の意味`],
      },
    ],
  };
}

function tg(id: string): { text: string; meaning: string } {
  return { text: `sentence ${id}`, meaning: `例文${id}の意味` };
}

function material(partial: Partial<QuizSourceMaterial>): QuizSourceMaterial {
  return { targets: [], sameOccurrencePool: [], allWordsPool: [], ...partial };
}

describe("buildChoiceTgQuestions", () => {
  test("builds a 4-choice question: prompt is the TG text, correct choice is the TG meaning", () => {
    const target = word("t", tg("t"), { audio: "https://audio/t" });
    const m = material({
      targets: [target],
      sameOccurrencePool: [word("d1", tg("d1")), word("d2", tg("d2")), word("d3", tg("d3"))],
    });
    const [q] = buildChoiceTgQuestions(m, seededRng(1));
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("hw-t");
    expect(q.pronunciationAudioUrl).toBe("https://audio/t");
    expect(q.prompt).toBe("sentence t");
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.correctIndex].text).toBe("例文tの意味");
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect([...dummyTexts].sort()).toEqual(["例文d1の意味", "例文d2の意味", "例文d3の意味"]);
  });

  test("asks only targets that have a usable TG example (one question per usable word)", () => {
    const m = material({
      targets: [word("t1", tg("t1")), word("t2", null), word("t3", tg("t3"))],
      sameOccurrencePool: [word("d1", tg("d1"))],
    });
    const questions = buildChoiceTgQuestions(m, seededRng(1));
    expect([...questions.map((q) => q.wordId)].sort()).toEqual(["t1", "t3"]);
  });

  test("throws QuizGenerationError when no target has a usable TG example", () => {
    const m = material({
      targets: [word("t1", null), word("t2", null)],
      sameOccurrencePool: [word("d1", tg("d1"))],
    });
    expect(() => buildChoiceTgQuestions(m, seededRng(1))).toThrow(QuizGenerationError);
    expect(() => buildChoiceTgQuestions(m, seededRng(1))).toThrow(NO_TG_TARGET_REASON);
  });

  test("uses only words with a TG example as dummy candidates", () => {
    const m = material({
      targets: [word("t", tg("t"))],
      sameOccurrencePool: [word("d1", null), word("d2", tg("d2"))],
    });
    const [q] = buildChoiceTgQuestions(m, seededRng(1));
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toEqual(["例文d2の意味"]);
  });

  test("prefers the primary pool (targets + same occurrence) over the all-words pool", () => {
    const m = material({
      targets: [word("t", tg("t")), word("o1", tg("o1"))],
      sameOccurrencePool: [word("o2", tg("o2")), word("o3", tg("o3"))],
      allWordsPool: [word("f1", tg("f1"))],
    });
    const questions = buildChoiceTgQuestions(m, seededRng(1));
    const q = questions.find((x) => x.wordId === "t");
    expect(q).toBeDefined();
    const dummyTexts = q!.choices.filter((_, i) => i !== q!.correctIndex).map((c) => c.text);
    expect([...dummyTexts].sort()).toEqual(["例文o1の意味", "例文o2の意味", "例文o3の意味"].sort());
  });

  test("supplements the shortfall from the all-words pool", () => {
    const m = material({
      targets: [word("t", tg("t"))],
      sameOccurrencePool: [word("o1", tg("o1"))],
      allWordsPool: [word("f1", tg("f1")), word("f2", tg("f2"))],
    });
    const [q] = buildChoiceTgQuestions(m, seededRng(1));
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toContain("例文o1の意味");
    expect(dummyTexts).toHaveLength(3);
  });

  test("excludes dummies whose TG meaning trim-matches the target's TG meaning", () => {
    const m = material({
      targets: [word("t", { text: "sentence t", meaning: "同じ意味" })],
      sameOccurrencePool: [
        word("d1", { text: "sentence d1", meaning: " 同じ意味 " }),
        word("d2", tg("d2")),
      ],
    });
    const [q] = buildChoiceTgQuestions(m, seededRng(1));
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toEqual(["例文d2の意味"]);
  });

  test("degrades below 4 choices but keeps at least 2 (1 dummy)", () => {
    const m = material({
      targets: [word("t", tg("t"))],
      sameOccurrencePool: [word("d1", tg("d1"))],
    });
    const [q] = buildChoiceTgQuestions(m, seededRng(1));
    expect(q.choices).toHaveLength(2);
    expect(q.choices[q.correctIndex].text).toBe("例文tの意味");
  });

  test("throws QuizGenerationError when no dummy is available", () => {
    const m = material({
      targets: [word("t", tg("t"))],
      sameOccurrencePool: [word("d1", null)],
    });
    expect(() => buildChoiceTgQuestions(m, seededRng(1))).toThrow(QuizGenerationError);
  });

  test("covers every usable target exactly once in shuffled order, deterministically", () => {
    const targets = ["t1", "t2", "t3", "t4", "t5"].map((id) => word(id, tg(id)));
    const m = material({ targets });
    const first = buildChoiceTgQuestions(m, seededRng(42));
    const second = buildChoiceTgQuestions(m, seededRng(42));
    expect(first.map((q) => q.wordId)).toEqual(second.map((q) => q.wordId));
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });
});
