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
    const [q] = buildChoiceJaEnQuestions(m, seededRng(1), false);
    expect(q.wordId).toBe("t");
    expect(q.headword).toBe("hw-t");
    // 非 TG 形式の鳴らす対象は従来どおり見出し語（音源＝最初の Meaning、読み上げ＝headword）
    expect(q.pronunciationAudioUrl).toBe("https://audio/t");
    expect(q.ttsText).toBe("hw-t");
    // 問題文は最初の Meaning のみ「; 」連結（2 件目「走行」は含めない）
    expect(q.prompt).toBe("走る; 駆ける");
    // 正解は target の headword、選択肢はすべて headword
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.correctIndex].text).toBe("hw-t");
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect([...dummyTexts].sort()).toEqual(["hw-d1", "hw-d2", "hw-d3"]);
  });

  test("firstMeaningTextOnly = true: prompt is only the head text of the first meaning", () => {
    const target = word("t", [["走る", "駆ける"], ["走行"]]);
    const m = material({
      targets: [target],
      sameOccurrencePool: [word("d1", [["歩く"]]), word("d2", [["泳ぐ"]]), word("d3", [["飛ぶ"]])],
    });
    const [q] = buildChoiceJaEnQuestions(m, seededRng(1), true);
    expect(q.prompt).toBe("走る");
    // 選択肢（headword）は設定の影響を受けない
    expect(q.choices[q.correctIndex].text).toBe("hw-t");
  });

  test("prefers the primary pool (targets + same occurrence) over the all-words pool", () => {
    const m = material({
      targets: [word("t", [["走る"]]), word("o1", [["読む"]])],
      sameOccurrencePool: [word("o2", [["書く"]]), word("o3", [["聞く"]])],
      allWordsPool: [word("f1", [["話す"]])],
    });
    const q = buildChoiceJaEnQuestions(m, seededRng(1), false).find((x) => x.wordId === "t");
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
    const [q] = buildChoiceJaEnQuestions(m, seededRng(1), false);
    const dummyTexts = q.choices.filter((_, i) => i !== q.correctIndex).map((c) => c.text);
    expect(dummyTexts).toEqual(["walk"]);
  });

  test("degrades below 4 choices but keeps at least 2 (1 dummy)", () => {
    const m = material({
      targets: [word("t", [["走る"]])],
      sameOccurrencePool: [word("d1", [["歩く"]])],
    });
    const [q] = buildChoiceJaEnQuestions(m, seededRng(1), false);
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
    expect(() => buildChoiceJaEnQuestions(m, seededRng(1), false)).toThrow(QuizGenerationError);
  });

  test("covers every target exactly once, deterministically for the same seed", () => {
    const targets = ["t1", "t2", "t3", "t4", "t5"].map((id) => word(id, [[id]]));
    const m = material({ targets });
    const first = buildChoiceJaEnQuestions(m, seededRng(42), false);
    const second = buildChoiceJaEnQuestions(m, seededRng(42), false);
    expect(first.map((q) => q.wordId)).toEqual(second.map((q) => q.wordId));
    expect([...first.map((q) => q.wordId)].sort()).toEqual(["t1", "t2", "t3", "t4", "t5"]);
  });

  // 設定 ON では問題文が先頭の訳語 1 つになるため、先頭訳語が同じ単語は正解と等価な選択肢になる。
  describe("firstMeaningTextOnly = true: ダミーの先頭訳語衝突", () => {
    /** target "t"（先頭訳語「走る」）の問題のダミー選択肢テキスト。 */
    function dummiesOf(m: QuizSourceMaterial, firstMeaningTextOnly: boolean): string[] {
      const q = buildChoiceJaEnQuestions(m, seededRng(1), firstMeaningTextOnly).find(
        (x) => x.wordId === "t",
      );
      expect(q).toBeDefined();
      return q!.choices.filter((_, i) => i !== q!.correctIndex).map((c) => c.text);
    }

    test("excludes a dummy whose first meaning text matches the target's", () => {
      const m = material({
        targets: [word("t", [["走る", "駆ける"]])],
        // d1 は先頭訳語が「走る」で衝突。d2 は先頭訳語が違う（2 件目が「走る」でも衝突しない）
        sameOccurrencePool: [word("d1", [["走る", "疾走する"]]), word("d2", [["歩く", "走る"]])],
      });
      expect(dummiesOf(m, true)).toEqual(["hw-d2"]);
    });

    test("keeps such a dummy when the setting is OFF (従来どおり)", () => {
      const m = material({
        targets: [word("t", [["走る", "駆ける"]])],
        sameOccurrencePool: [word("d1", [["走る", "疾走する"]]), word("d2", [["歩く", "走る"]])],
      });
      expect([...dummiesOf(m, false)].sort()).toEqual(["hw-d1", "hw-d2"]);
    });

    test("does not treat words without meanings (empty head text) as colliding", () => {
      // 訳語未登録同士は空文字で一致するが、キーに載せないので衝突扱いにしない
      const m = material({
        targets: [word("t", [])],
        sameOccurrencePool: [word("d1", []), word("d2", [[]])],
      });
      expect([...dummiesOf(m, true)].sort()).toEqual(["hw-d1", "hw-d2"]);
    });

    test("compares first meaning texts with rich-text markup stripped", () => {
      const m = material({
        targets: [word("t", [["走る"]])],
        sameOccurrencePool: [word("d1", [["**走る**"]]), word("d2", [["歩く"]])],
      });
      expect(dummiesOf(m, true)).toEqual(["hw-d2"]);
    });

    test("still dedupes dummies by headword, not by first meaning text", () => {
      // 先頭訳語が同じダミー同士（正解とは衝突しない）は両方残る（表示は headword なので見た目重複しない）
      const m = material({
        targets: [word("t", [["走る"]])],
        sameOccurrencePool: [word("d1", [["歩く"]]), word("d2", [["歩く"]])],
      });
      expect([...dummiesOf(m, true)].sort()).toEqual(["hw-d1", "hw-d2"]);
    });

    test("throws QuizGenerationError when every candidate collides by headword or first meaning", () => {
      const m = material({
        targets: [word("t", [["走る"]])],
        sameOccurrencePool: [word("d1", [["走る"]]), word("d2", [[" 走る "]])],
      });
      // 設定 OFF なら headword が異なるので成立する
      expect(() => buildChoiceJaEnQuestions(m, seededRng(1), false)).not.toThrow();
      expect(() => buildChoiceJaEnQuestions(m, seededRng(1), true)).toThrow(QuizGenerationError);
    });
  });
});
