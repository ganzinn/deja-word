import { describe, expect, test } from "vitest";

import {
  firstMeaningDisplayText,
  partitionMaterial,
  retargetMaterial,
  type QuizSourceMaterial,
  type QuizSourceRow,
  type QuizWord,
} from "./material";

function word(id: string): QuizWord {
  return {
    id,
    headword: id,
    tgExample: null,
    meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: [`${id}の意味`] }],
  };
}

function ids(words: QuizWord[]): string[] {
  return words.map((w) => w.id);
}

function row(id: string): QuizSourceRow {
  return {
    id,
    headword: id,
    meanings: [
      { partOfSpeech: null, pronunciationAudioUrl: null, texts: [{ text: `${id}の意味` }] },
    ],
  };
}

describe("firstMeaningDisplayText", () => {
  /** 最初の Meaning に訳語 2 件、2 件目の Meaning にも訳語を持つ単語。 */
  const multi: QuizWord = {
    id: "t",
    headword: "run",
    tgExample: null,
    meanings: [
      { partOfSpeech: "動詞", pronunciationAudioUrl: null, texts: ["走る", "駆ける"] },
      { partOfSpeech: null, pronunciationAudioUrl: null, texts: ["経営する"] },
    ],
  };

  test("ON: returns only the first MeaningText of the first Meaning", () => {
    expect(firstMeaningDisplayText(multi, true)).toBe("走る");
  });

  test("OFF: joins the first Meaning's texts with '; ' (2 件目の Meaning は含めない)", () => {
    expect(firstMeaningDisplayText(multi, false)).toBe("走る; 駆ける");
  });

  test("returns an empty string when the word has no meaning text", () => {
    const noMeanings: QuizWord = { id: "n", headword: "n", tgExample: null, meanings: [] };
    const noTexts: QuizWord = {
      id: "e",
      headword: "e",
      tgExample: null,
      meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: [] }],
    };
    expect(firstMeaningDisplayText(noMeanings, true)).toBe("");
    expect(firstMeaningDisplayText(noMeanings, false)).toBe("");
    expect(firstMeaningDisplayText(noTexts, true)).toBe("");
    expect(firstMeaningDisplayText(noTexts, false)).toBe("");
  });
});

describe("partitionMaterial", () => {
  test("attaches the TG example row to the matching word across all three partitions", () => {
    const material = partitionMaterial(
      [row("t1"), row("t2")],
      [row("s1")],
      [row("f1")],
      [
        {
          wordId: "t1",
          text: "sentence t1",
          meaning: "例文t1",
          pronunciationAudioUrl: "https://audio/example-t1",
        },
        { wordId: "s1", text: "sentence s1", meaning: "例文s1", pronunciationAudioUrl: null },
        { wordId: "f1", text: "sentence f1", meaning: "例文f1", pronunciationAudioUrl: null },
      ],
    );
    expect(material.targets[0].tgExample).toEqual({
      text: "sentence t1",
      meaning: "例文t1",
      pronunciationAudioUrl: "https://audio/example-t1",
    });
    // 使える TG 例文が無い単語は null
    expect(material.targets[1].tgExample).toBeNull();
    expect(material.sameOccurrencePool[0].tgExample).toEqual({
      text: "sentence s1",
      meaning: "例文s1",
      pronunciationAudioUrl: null,
    });
    expect(material.allWordsPool[0].tgExample).toEqual({
      text: "sentence f1",
      meaning: "例文f1",
      pronunciationAudioUrl: null,
    });
  });

  test("defaults every tgExample to null when TG rows are not fetched (non-TG formats)", () => {
    const material = partitionMaterial([row("t1")], [row("s1")], []);
    expect(material.targets[0].tgExample).toBeNull();
    expect(material.sameOccurrencePool[0].tgExample).toBeNull();
  });
});

describe("retargetMaterial", () => {
  const base: QuizSourceMaterial = {
    targets: [word("t1"), word("t2"), word("t3")],
    sameOccurrencePool: [word("s1"), word("s2")],
    allWordsPool: [word("f1"), word("f2")],
  };

  test("collects targets across all three partitions", () => {
    const material = retargetMaterial(base, new Set(["t1", "s1", "f1"]));
    expect(ids(material.targets)).toEqual(["t1", "s1", "f1"]);
  });

  test("moves non-target ex-targets into sameOccurrencePool (they remain dummy candidates)", () => {
    const material = retargetMaterial(base, new Set(["t1"]));
    expect(ids(material.targets)).toEqual(["t1"]);
    expect(ids(material.sameOccurrencePool)).toEqual(["t2", "t3", "s1", "s2"]);
  });

  test("keeps non-target fallback words in allWordsPool", () => {
    const material = retargetMaterial(base, new Set(["t1", "f1"]));
    expect(ids(material.allWordsPool)).toEqual(["f2"]);
    // fallback 出身の target は同一 Occurrence プールへは行かない
    expect(ids(material.sameOccurrencePool)).toEqual(["t2", "t3", "s1", "s2"]);
  });

  test("unknown target ids are ignored (partitions stay disjoint and complete)", () => {
    const material = retargetMaterial(base, new Set(["t2", "missing"]));
    expect(ids(material.targets)).toEqual(["t2"]);
    const all = [
      ...ids(material.targets),
      ...ids(material.sameOccurrencePool),
      ...ids(material.allWordsPool),
    ].sort();
    expect(all).toEqual(["f1", "f2", "s1", "s2", "t1", "t2", "t3"]);
  });

  test("empty target set empties targets and demotes everything to the pools", () => {
    const material = retargetMaterial(base, new Set());
    expect(material.targets).toEqual([]);
    expect(ids(material.sameOccurrencePool)).toEqual(["t1", "t2", "t3", "s1", "s2"]);
    expect(ids(material.allWordsPool)).toEqual(["f1", "f2"]);
  });

  test("preserves tgExample through retargeting (drill rounds keep TG material)", () => {
    const tg = { text: "sentence t1", meaning: "例文t1", pronunciationAudioUrl: null };
    const withTg: QuizSourceMaterial = {
      targets: [{ ...word("t1"), tgExample: tg }],
      sameOccurrencePool: [word("s1")],
      allWordsPool: [],
    };
    const material = retargetMaterial(withTg, new Set(["s1"]));
    // t1 はダミー候補側へ回っても tgExample を保持する
    expect(material.sameOccurrencePool[0].tgExample).toEqual(tg);
  });
});
