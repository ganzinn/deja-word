import { describe, expect, test } from "vitest";

import { retargetMaterial, type QuizSourceMaterial, type QuizWord } from "./material";

function word(id: string): QuizWord {
  return {
    id,
    headword: id,
    meanings: [{ partOfSpeech: null, pronunciationAudioUrl: null, texts: [`${id}の意味`] }],
  };
}

function ids(words: QuizWord[]): string[] {
  return words.map((w) => w.id);
}

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
});
