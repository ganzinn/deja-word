import { describe, expect, test } from "vitest";

import type { QuizSourceMaterial, QuizWord } from "@/lib/quiz/generation/material";
import { buildSelfJudgeJaEnQuestions } from "@/lib/quiz/generation/self-judge-ja-en";
import { seededRng } from "../../../../tests/setup/seeded-rng";

function material(targets: QuizWord[]): QuizSourceMaterial {
  return { targets, sameOccurrencePool: [], allWordsPool: [] };
}

const target: QuizWord = {
  id: "t",
  headword: "run",
  tgExample: null,
  meanings: [
    { partOfSpeech: "動詞", pronunciationAudioUrl: "https://audio/run", texts: ["走る", "駆ける"] },
    { partOfSpeech: null, pronunciationAudioUrl: null, texts: ["経営する"] },
  ],
};

describe("buildSelfJudgeJaEnQuestions", () => {
  test("prompt is the first meaning joined with '; '; headword (answer) is preserved", () => {
    const [q] = buildSelfJudgeJaEnQuestions(material([target]), seededRng(1), false);
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("run");
    // 非 TG 形式の鳴らす対象は従来どおり見出し語（音源＝最初の Meaning、読み上げ＝headword）
    expect(q.pronunciationAudioUrl).toBe("https://audio/run");
    expect(q.ttsText).toBe("run");
    // 最初の Meaning のみ「; 」連結（2 件目「経営する」・品詞は含めない）
    expect(q.prompt).toBe("走る; 駆ける");
  });

  test("firstMeaningTextOnly = true: prompt is only the head text of the first meaning", () => {
    const [q] = buildSelfJudgeJaEnQuestions(material([target]), seededRng(1), true);
    expect(q.prompt).toBe("走る");
    // 解答（headword）は設定の影響を受けない
    expect(q.headword).toBe("run");
  });

  test("is deterministic and covers every target once", () => {
    const targets = ["a", "b", "c"].map((id) => ({
      id,
      headword: id,
      tgExample: null,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: [id] }],
    }));
    const first = buildSelfJudgeJaEnQuestions(material(targets), seededRng(7), false);
    const second = buildSelfJudgeJaEnQuestions(material(targets), seededRng(7), false);
    expect(first).toEqual(second);
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["a", "b", "c"]);
  });
});
