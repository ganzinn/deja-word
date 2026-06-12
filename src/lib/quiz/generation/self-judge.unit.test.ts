import { describe, expect, test } from "vitest";

import type { QuizSourceMaterial, QuizWord } from "@/lib/quiz/generation/material";
import { buildSelfJudgeQuestions } from "@/lib/quiz/generation/self-judge";
import { seededRng } from "../../../../tests/setup/seeded-rng";

function material(targets: QuizWord[]): QuizSourceMaterial {
  return { targets, sameOccurrencePool: [], allWordsPool: [] };
}

describe("buildSelfJudgeQuestions", () => {
  test("answer carries every meaning (part of speech + texts) in order", () => {
    const target: QuizWord = {
      id: "t",
      headword: "run",
      meanings: [
        {
          partOfSpeech: "動詞",
          pronunciationAudioUrl: "https://audio/run",
          texts: ["走る", "駆ける"],
        },
        { partOfSpeech: null, pronunciationAudioUrl: null, texts: ["経営する"] },
      ],
    };
    const [q] = buildSelfJudgeQuestions(material([target]), seededRng(1));
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("run");
    expect(q.pronunciationAudioUrl).toBe("https://audio/run");
    expect(q.answer).toEqual([
      { partOfSpeech: "動詞", texts: ["走る", "駆ける"] },
      { partOfSpeech: null, texts: ["経営する"] },
    ]);
  });

  test("pronunciationAudioUrl is null when the first meaning has no audio", () => {
    const target: QuizWord = {
      id: "t",
      headword: "walk",
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: ["歩く"] }],
    };
    const [q] = buildSelfJudgeQuestions(material([target]), seededRng(1));
    expect(q.pronunciationAudioUrl).toBeNull();
  });

  test("shuffles question order reproducibly (Fisher–Yates with rng always 0)", () => {
    const targets = ["w1", "w2", "w3"].map((id) => ({
      id,
      headword: id,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: [id] }],
    }));
    // rng=0 固定の Fisher–Yates: [w1, w2, w3] → [w2, w3, w1]
    const questions = buildSelfJudgeQuestions(material(targets), () => 0);
    expect(questions.map((q) => q.wordId)).toEqual(["w2", "w3", "w1"]);
  });

  test("is deterministic for the same seed and covers every target once", () => {
    const targets = ["a", "b", "c", "d"].map((id) => ({
      id,
      headword: id,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: [id] }],
    }));
    const first = buildSelfJudgeQuestions(material(targets), seededRng(7));
    const second = buildSelfJudgeQuestions(material(targets), seededRng(7));
    expect(first).toEqual(second);
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["a", "b", "c", "d"]);
  });
});
