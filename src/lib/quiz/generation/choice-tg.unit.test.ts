import { describe, expect, test } from "vitest";

import { buildChoiceTgQuestions } from "@/lib/quiz/generation/choice-tg";
import { QuizGenerationError } from "@/lib/quiz/generation/dummy-pool";
import {
  NO_TG_TARGET_REASON,
  type QuizSourceMaterial,
  type QuizWord,
} from "@/lib/quiz/generation/material";
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

describe("buildChoiceTgQuestions", () => {
  test("builds a 4-choice question: prompt is the TG text, correct choice is the TG meaning", () => {
    // 発音ボタンが鳴らすのは TG 例文の音源。見出し語（Meaning）の音源は使わない
    const target = word("t", tg("t", "https://audio/example-t"), {
      headwordAudio: "https://audio/hw-t",
    });
    const m = material({
      targets: [target],
      sameOccurrencePool: [word("d1", tg("d1")), word("d2", tg("d2")), word("d3", tg("d3"))],
    });
    const [q] = buildChoiceTgQuestions(m, seededRng(1));
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("hw-t");
    expect(q.pronunciationAudioUrl).toBe("https://audio/example-t");
    expect(q.ttsText).toBe("sentence t");
    expect(q.prompt).toBe("sentence t");
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.correctIndex].text).toBe("例文tの意味");
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect([...dummyTexts].sort()).toEqual(["例文d1の意味", "例文d2の意味", "例文d3の意味"]);
  });

  test("builds a question for a target with no word meanings (meanings: []) — TG payload is meaning-independent", () => {
    // 単語自身の意味が未登録でも、使える TG 例文があれば TG 四択は成立する（発音音源だけ null に退化）。
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
    const [q] = buildChoiceTgQuestions(m, seededRng(1));
    expect(q.wordId).toBe("mt");
    expect(q.headword).toBe("hw-mt");
    expect(q.pronunciationAudioUrl).toBeNull();
    expect(q.ttsText).toBe("sentence mt");
    expect(q.prompt).toBe("sentence mt");
    expect(q.choices[q.correctIndex].text).toBe("例文mtの意味");
  });

  test("does not fall back to the headword audio when the TG example has no audio", () => {
    const target = word("t", tg("t"), { headwordAudio: "https://audio/hw-t" });
    const m = material({ targets: [target], sameOccurrencePool: [word("d1", tg("d1"))] });
    const [q] = buildChoiceTgQuestions(m, seededRng(1));
    expect(q.pronunciationAudioUrl).toBeNull();
    // 音源が無ければ読み上げも例文の英文（見出し語は鳴らさない）
    expect(q.ttsText).toBe("sentence t");
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
      targets: [word("t", { ...tg("t"), meaning: "同じ意味" })],
      sameOccurrencePool: [
        word("d1", { ...tg("d1"), meaning: " 同じ意味 " }),
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
