import { describe, expect, test } from "vitest";

import type { QuizSourceMaterial, QuizWord } from "@/lib/quiz/generation/material";
import { buildSelfJudgeJaEnQuestions } from "@/lib/quiz/generation/self-judge-ja-en";
import { buildSpellingQuestions } from "@/lib/quiz/generation/spelling";
import { seededRng } from "../../../../tests/setup/seeded-rng";

function material(targets: QuizWord[]): QuizSourceMaterial {
  return { targets, sameOccurrencePool: [], allWordsPool: [] };
}

const target: QuizWord = {
  id: "t",
  headword: "run",
  meanings: [
    { partOfSpeech: "動詞", pronunciationAudioUrl: "https://audio/run", texts: ["走る", "駆ける"] },
    { partOfSpeech: null, pronunciationAudioUrl: null, texts: ["経営する"] },
  ],
};

describe("buildSelfJudgeJaEnQuestions", () => {
  test("prompt carries every meaning; headword (answer) is preserved", () => {
    const [q] = buildSelfJudgeJaEnQuestions(material([target]), seededRng(1));
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("run");
    expect(q.pronunciationAudioUrl).toBe("https://audio/run");
    expect(q.prompt).toEqual([
      { partOfSpeech: "動詞", texts: ["走る", "駆ける"] },
      { partOfSpeech: null, texts: ["経営する"] },
    ]);
  });

  test("is deterministic and covers every target once", () => {
    const targets = ["a", "b", "c"].map((id) => ({
      id,
      headword: id,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: [id] }],
    }));
    const first = buildSelfJudgeJaEnQuestions(material(targets), seededRng(7));
    const second = buildSelfJudgeJaEnQuestions(material(targets), seededRng(7));
    expect(first).toEqual(second);
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("buildSpellingQuestions", () => {
  test("prompt carries every meaning; headword (answer) is preserved", () => {
    const [q] = buildSpellingQuestions(material([target]), seededRng(1));
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("run");
    expect(q.pronunciationAudioUrl).toBe("https://audio/run");
    expect(q.prompt).toEqual([
      { partOfSpeech: "動詞", texts: ["走る", "駆ける"] },
      { partOfSpeech: null, texts: ["経営する"] },
    ]);
  });
});
