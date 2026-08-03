import { describe, expect, test } from "vitest";

import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import {
  NO_TG_TARGET_REASON,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
import { buildSelfJudgeTgQuestions } from "@/lib/quiz/generation/self-judge-tg";
import { seededRng } from "../../../../tests/setup/seeded-rng";

function word(
  id: string,
  tgExample: QuizWord["tgExample"],
  options: { headwordAudio?: string | null } = {},
): QuizWord {
  return {
    id,
    headword: `hw-${id}`,
    tgExample,
    meanings: [
      {
        partOfSpeech: null,
        pronunciationAudioUrl: options.headwordAudio ?? null,
        texts: [`${id}の意味`],
      },
    ],
  };
}

/** 使える TG 例文。audio は例文の発音音源 URL（省略時は未登録）。 */
function tg(id: string, audio: string | null = null): NonNullable<QuizWord["tgExample"]> {
  return { text: `sentence ${id}`, meaning: `例文${id}の意味`, pronunciationAudioUrl: audio };
}

function material(partial: Partial<QuizSourceMaterial>): QuizSourceMaterial {
  return { targets: [], sameOccurrencePool: [], allWordsPool: [], ...partial };
}

describe("buildSelfJudgeTgQuestions", () => {
  test("prompt is the TG text and answer is the TG meaning", () => {
    // 発音ボタンが鳴らすのは TG 例文の音源。見出し語（Meaning）の音源は使わない
    const target = word("t", tg("t", "https://audio/example-t"), {
      headwordAudio: "https://audio/hw-t",
    });
    const [q] = buildSelfJudgeTgQuestions(material({ targets: [target] }), seededRng(1));
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("hw-t");
    expect(q.pronunciationAudioUrl).toBe("https://audio/example-t");
    expect(q.ttsText).toBe("sentence t");
    expect(q.prompt).toBe("sentence t");
    expect(q.answer).toBe("例文tの意味");
  });

  test("builds a question for a target with no word meanings (meanings: []) — TG payload is meaning-independent", () => {
    // 単語自身の意味が未登録でも、使える TG 例文があれば TG自己判定は成立する（発音音源だけ null に退化）。
    const meaninglessTarget: QuizWord = {
      id: "mt",
      headword: "hw-mt",
      tgExample: tg("mt"),
      meanings: [],
    };
    const [q] = buildSelfJudgeTgQuestions(material({ targets: [meaninglessTarget] }), seededRng(1));
    expect(q.wordId).toBe("mt");
    expect(q.headword).toBe("hw-mt");
    expect(q.pronunciationAudioUrl).toBeNull();
    expect(q.ttsText).toBe("sentence mt");
    expect(q.prompt).toBe("sentence mt");
    expect(q.answer).toBe("例文mtの意味");
  });

  test("does not fall back to the headword audio when the TG example has no audio", () => {
    const target = word("t", tg("t"), { headwordAudio: "https://audio/hw-t" });
    const [q] = buildSelfJudgeTgQuestions(material({ targets: [target] }), seededRng(1));
    expect(q.pronunciationAudioUrl).toBeNull();
    // 音源が無ければ読み上げも例文の英文（見出し語は鳴らさない）
    expect(q.ttsText).toBe("sentence t");
  });

  test("asks only targets that have a usable TG example (one question per usable word)", () => {
    const m = material({
      targets: [word("t1", tg("t1")), word("t2", null), word("t3", tg("t3"))],
    });
    const questions = buildSelfJudgeTgQuestions(m, seededRng(1));
    expect([...questions.map((q) => q.wordId)].sort()).toEqual(["t1", "t3"]);
  });

  test("throws QuizGenerationError when no target has a usable TG example", () => {
    const m = material({
      targets: [word("t1", null), word("t2", null)],
      sameOccurrencePool: [word("d1", tg("d1"))],
    });
    expect(() => buildSelfJudgeTgQuestions(m, seededRng(1))).toThrow(QuizGenerationError);
    expect(() => buildSelfJudgeTgQuestions(m, seededRng(1))).toThrow(NO_TG_TARGET_REASON);
  });

  test("shuffles question order reproducibly (Fisher–Yates with rng always 0)", () => {
    const targets = ["w1", "w2", "w3"].map((id) => word(id, tg(id)));
    // rng=0 固定の Fisher–Yates: [w1, w2, w3] → [w2, w3, w1]
    const questions = buildSelfJudgeTgQuestions(material({ targets }), () => 0);
    expect(questions.map((q) => q.wordId)).toEqual(["w2", "w3", "w1"]);
  });

  test("is deterministic for the same seed and covers every usable target once", () => {
    const targets = ["a", "b", "c", "d"].map((id) => word(id, tg(id)));
    const first = buildSelfJudgeTgQuestions(material({ targets }), seededRng(7));
    const second = buildSelfJudgeTgQuestions(material({ targets }), seededRng(7));
    expect(first).toEqual(second);
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["a", "b", "c", "d"]);
  });
});
