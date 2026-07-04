import { describe, expect, test } from "vitest";

import { buildChoiceTgJaEnQuestions } from "@/lib/quiz/generation/choice-tg-ja-en";
import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import {
  NO_TG_TARGET_REASON,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
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

describe("buildChoiceTgJaEnQuestions", () => {
  test("builds a 4-choice question: prompt is the TG meaning, correct choice is the TG text", () => {
    const target = word("t", tg("t"), { audio: "https://audio/t" });
    const m = material({
      targets: [target],
      sameOccurrencePool: [word("d1", tg("d1")), word("d2", tg("d2")), word("d3", tg("d3"))],
    });
    const [q] = buildChoiceTgJaEnQuestions(m, seededRng(1));
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("hw-t");
    expect(q.pronunciationAudioUrl).toBe("https://audio/t");
    expect(q.prompt).toBe("例文tの意味");
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.correctIndex].text).toBe("sentence t");
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect([...dummyTexts].sort()).toEqual(["sentence d1", "sentence d2", "sentence d3"]);
  });

  test("builds a question for a target with no word meanings (meanings: []) — TG payload is meaning-independent", () => {
    // 単語自身の意味が未登録でも、使える TG 例文があれば TG 四択（日→英）は成立する。
    const meaninglessTarget: QuizWord = {
      id: "mt",
      headword: "hw-mt",
      tgExample: tg("mt"),
      meanings: [],
    };
    const m = material({
      targets: [meaninglessTarget],
      sameOccurrencePool: [word("d1", tg("d1")), word("d2", tg("d2")), word("d3", tg("d3"))],
    });
    const [q] = buildChoiceTgJaEnQuestions(m, seededRng(1));
    expect(q.wordId).toBe("mt");
    expect(q.headword).toBe("hw-mt");
    expect(q.pronunciationAudioUrl).toBeNull();
    expect(q.prompt).toBe("例文mtの意味");
    expect(q.choices[q.correctIndex].text).toBe("sentence mt");
  });

  test("asks only targets that have a usable TG example (one question per usable word)", () => {
    const m = material({
      targets: [word("t1", tg("t1")), word("t2", null), word("t3", tg("t3"))],
      sameOccurrencePool: [word("d1", tg("d1"))],
    });
    const questions = buildChoiceTgJaEnQuestions(m, seededRng(1));
    expect([...questions.map((q) => q.wordId)].sort()).toEqual(["t1", "t3"]);
  });

  test("throws QuizGenerationError when no target has a usable TG example", () => {
    const m = material({
      targets: [word("t1", null)],
      sameOccurrencePool: [word("d1", tg("d1"))],
    });
    expect(() => buildChoiceTgJaEnQuestions(m, seededRng(1))).toThrow(QuizGenerationError);
    expect(() => buildChoiceTgJaEnQuestions(m, seededRng(1))).toThrow(NO_TG_TARGET_REASON);
  });

  test("uses only words with a TG example as dummy candidates", () => {
    const m = material({
      targets: [word("t", tg("t"))],
      sameOccurrencePool: [word("d1", null), word("d2", tg("d2"))],
    });
    const [q] = buildChoiceTgJaEnQuestions(m, seededRng(1));
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toEqual(["sentence d2"]);
  });

  test("excludes dummies whose TG text trim-matches the target's TG text", () => {
    const m = material({
      targets: [word("t", { text: "same sentence", meaning: "例文tの意味" })],
      sameOccurrencePool: [
        word("d1", { text: " same sentence ", meaning: "例文d1の意味" }),
        word("d2", tg("d2")),
      ],
    });
    const [q] = buildChoiceTgJaEnQuestions(m, seededRng(1));
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toEqual(["sentence d2"]);
  });

  test("degrades below 4 choices but keeps at least 2 (1 dummy)", () => {
    const m = material({
      targets: [word("t", tg("t"))],
      sameOccurrencePool: [word("d1", tg("d1"))],
    });
    const [q] = buildChoiceTgJaEnQuestions(m, seededRng(1));
    expect(q.choices).toHaveLength(2);
    expect(q.choices[q.correctIndex].text).toBe("sentence t");
  });

  test("throws QuizGenerationError when no dummy is available", () => {
    const m = material({
      targets: [word("t", tg("t"))],
      sameOccurrencePool: [word("d1", null)],
    });
    expect(() => buildChoiceTgJaEnQuestions(m, seededRng(1))).toThrow(QuizGenerationError);
  });

  test("covers every usable target exactly once in shuffled order, deterministically", () => {
    const targets = ["t1", "t2", "t3", "t4"].map((id) => word(id, tg(id)));
    const m = material({ targets });
    const first = buildChoiceTgJaEnQuestions(m, seededRng(7));
    const second = buildChoiceTgJaEnQuestions(m, seededRng(7));
    expect(first).toEqual(second);
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["t1", "t2", "t3", "t4"]);
  });
});
