import { describe, expect, test } from "vitest";

import { buildChoiceJaEnQuestions } from "@/lib/quiz/generation/choice-ja-en";
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

describe("buildChoiceJaEnQuestions", () => {
  test("prompt is the first meaning joined with '; ' and choices are English headwords", () => {
    const target = word("t", [["走る", "駆ける"], ["走行"]], { audio: "https://audio/t" });
    const m = material({
      targets: [target],
      sameOccurrencePool: [word("d1", [["歩く"]]), word("d2", [["泳ぐ"]]), word("d3", [["飛ぶ"]])],
    });
    const [q] = buildChoiceJaEnQuestions(m, seededRng(1));
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("hw-t");
    expect(q.pronunciationAudioUrl).toBe("https://audio/t");
    // 問題文は最初の Meaning のみ「; 」連結（2 件目「走行」は含めない）
    expect(q.prompt).toBe("走る; 駆ける");
    // 正解は target の headword、選択肢はすべて headword
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.correctIndex].text).toBe("hw-t");
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect([...dummyTexts].sort()).toEqual(["hw-d1", "hw-d2", "hw-d3"]);
  });

  test("prefers the primary pool (targets + same occurrence) over the all-words pool", () => {
    const m = material({
      targets: [word("t", [["走る"]]), word("o1", [["読む"]])],
      sameOccurrencePool: [word("o2", [["書く"]]), word("o3", [["聞く"]])],
      allWordsPool: [word("f1", [["話す"]])],
    });
    const q = buildChoiceJaEnQuestions(m, seededRng(1)).find((x) => x.wordId === "t");
    expect(q).toBeDefined();
    const dummyTexts = q!.choices.filter((_, i) => i !== q!.correctIndex).map((c) => c.text);
    expect([...dummyTexts].sort()).toEqual(["hw-o1", "hw-o2", "hw-o3"].sort());
  });

  test("excludes dummies whose headword trim-matches the target headword", () => {
    const target: QuizWord = {
      id: "t",
      headword: "run",
      tgExample: null,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: ["走る"] }],
    };
    const dupe: QuizWord = {
      id: "d1",
      headword: " run ",
      tgExample: null,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: ["駆ける"] }],
    };
    const ok: QuizWord = {
      id: "d2",
      headword: "walk",
      tgExample: null,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: ["歩く"] }],
    };
    const m = material({ targets: [target], sameOccurrencePool: [dupe, ok] });
    const [q] = buildChoiceJaEnQuestions(m, seededRng(1));
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toEqual(["walk"]);
  });

  test("degrades below 4 choices but keeps at least 2 (1 dummy)", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["歩く"]])],
    });
    const [q] = buildChoiceJaEnQuestions(m, seededRng(1));
    expect(q.choices).toHaveLength(2);
    expect(q.choices[q.correctIndex].text).toBe("hw-t");
  });

  test("throws QuizGenerationError when no headword dummy is available", () => {
    const target: QuizWord = {
      id: "t",
      headword: "run",
      tgExample: null,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: ["走る"] }],
    };
    const onlyDupe: QuizWord = {
      id: "d1",
      headword: "run",
      tgExample: null,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: ["駆ける"] }],
    };
    const m = material({ targets: [target], sameOccurrencePool: [onlyDupe] });
    expect(() => buildChoiceJaEnQuestions(m, seededRng(1))).toThrow(QuizGenerationError);
  });

  test("covers every target exactly once, deterministically for the same seed", () => {
    const targets = ["t1", "t2", "t3", "t4", "t5"].map((id) => word(id, [[id]]));
    const m = material({ targets });
    const first = buildChoiceJaEnQuestions(m, seededRng(42));
    const second = buildChoiceJaEnQuestions(m, seededRng(42));
    expect(first.map((q) => q.wordId)).toEqual(second.map((q) => q.wordId));
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });
});
