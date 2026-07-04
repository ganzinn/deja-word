import { describe, expect, test } from "vitest";

import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import {
  NO_TG_TARGET_REASON,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { buildSelfJudgeTgJaEnQuestions } from "@/lib/quiz/generation/self-judge-tg-ja-en";
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

describe("buildSelfJudgeTgJaEnQuestions", () => {
  test("prompt is the TG meaning and answer is the TG text", () => {
    const target = word("t", tg("t"), { audio: "https://audio/t" });
    const [q] = buildSelfJudgeTgJaEnQuestions(material({ targets: [target] }), seededRng(1));
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("hw-t");
    expect(q.pronunciationAudioUrl).toBe("https://audio/t");
    expect(q.prompt).toBe("例文tの意味");
    expect(q.answer).toBe("sentence t");
  });

  test("builds a question for a target with no word meanings (meanings: []) — TG payload is meaning-independent", () => {
    // 単語自身の意味が未登録でも、使える TG 例文があれば TG自己判定（日→英）は成立する。
    const meaninglessTarget: QuizWord = {
      id: "mt",
      headword: "hw-mt",
      tgExample: tg("mt"),
      meanings: [],
    };
    const [q] = buildSelfJudgeTgJaEnQuestions(
      material({ targets: [meaninglessTarget] }),
      seededRng(1),
    );
    expect(q.wordId).toBe("mt");
    expect(q.headword).toBe("hw-mt");
    expect(q.pronunciationAudioUrl).toBeNull();
    expect(q.prompt).toBe("例文mtの意味");
    expect(q.answer).toBe("sentence mt");
  });

  test("asks only targets that have a usable TG example (one question per usable word)", () => {
    const m = material({
      targets: [word("t1", tg("t1")), word("t2", null), word("t3", tg("t3"))],
    });
    const questions = buildSelfJudgeTgJaEnQuestions(m, seededRng(1));
    expect([...questions.map((q) => q.wordId)].sort()).toEqual(["t1", "t3"]);
  });

  test("throws QuizGenerationError when no target has a usable TG example", () => {
    const m = material({
      targets: [word("t1", null)],
      sameOccurrencePool: [word("d1", tg("d1"))],
    });
    expect(() => buildSelfJudgeTgJaEnQuestions(m, seededRng(1))).toThrow(QuizGenerationError);
    expect(() => buildSelfJudgeTgJaEnQuestions(m, seededRng(1))).toThrow(NO_TG_TARGET_REASON);
  });

  test("shuffles question order reproducibly (Fisher–Yates with rng always 0)", () => {
    const targets = ["w1", "w2", "w3"].map((id) => word(id, tg(id)));
    // rng=0 固定の Fisher–Yates: [w1, w2, w3] → [w2, w3, w1]
    const questions = buildSelfJudgeTgJaEnQuestions(material({ targets }), () => 0);
    expect(questions.map((q) => q.wordId)).toEqual(["w2", "w3", "w1"]);
  });

  test("is deterministic for the same seed and covers every usable target once", () => {
    const targets = ["a", "b", "c", "d"].map((id) => word(id, tg(id)));
    const first = buildSelfJudgeTgJaEnQuestions(material({ targets }), seededRng(7));
    const second = buildSelfJudgeTgJaEnQuestions(material({ targets }), seededRng(7));
    expect(first).toEqual(second);
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["a", "b", "c", "d"]);
  });
});
