import { describe, expect, test } from "vitest";

import type { WordAiDraft } from "@/lib/schema/word-ai-draft";
import {
  defaultWordFormValues,
  emptyExample,
  emptyMeaning,
  type WordFormValues,
} from "@/lib/schema/word-form";

import { computeAiDraftSections, mergeAiDraftIntoFormValues } from "./ai-draft-merge";

function draft(overrides: Partial<WordAiDraft> = {}): WordAiDraft {
  return {
    meanings: [
      { partOfSpeech: "adjective", pronunciation: "ɪˈfemərəl", texts: ["儚い", "つかの間の"] },
      { partOfSpeech: "noun", pronunciation: "", texts: ["短命なもの"] },
    ],
    phrases: [{ text: "ephemeral beauty", meaning: "儚い美しさ" }],
    sentences: [{ text: "Fame is ephemeral.", meaning: "名声は儚い。" }],
    ...overrides,
  };
}

function formValues(overrides: Partial<WordFormValues> = {}): WordFormValues {
  return { ...defaultWordFormValues, headword: "ephemeral", ...overrides };
}

describe("computeAiDraftSections", () => {
  test("初期フォーム（空意味カード 1 枚・examples なし）は全セクション生成対象", () => {
    expect(computeAiDraftSections(formValues())).toEqual({
      meanings: true,
      phrases: true,
      sentences: true,
    });
  });

  test("入力済みの意味があれば meanings は対象外（空カード混在でも）", () => {
    const values = formValues({
      meanings: [{ ...emptyMeaning, texts: [{ text: "儚い" }] }, emptyMeaning],
    });
    expect(computeAiDraftSections(values).meanings).toBe(false);
  });

  test("examples は kind 単位で判定する", () => {
    const values = formValues({
      examples: [{ ...emptyExample, kind: "PHRASE", text: "ephemeral beauty" }],
    });
    expect(computeAiDraftSections(values)).toEqual({
      meanings: true,
      phrases: false,
      sentences: true,
    });
  });

  test("TARGET / MINIMAL の行は phrases / sentences の判定に関与しない", () => {
    const values = formValues({
      examples: [{ ...emptyExample, kind: "TARGET", text: "TG の例文" }],
    });
    const sections = computeAiDraftSections(values);
    expect(sections.phrases).toBe(true);
    expect(sections.sentences).toBe(true);
  });

  test("空カードだけのセクションは生成対象のまま", () => {
    const values = formValues({ examples: [emptyExample] });
    expect(computeAiDraftSections(values).sentences).toBe(true);
  });
});

describe("mergeAiDraftIntoFormValues", () => {
  test("初期状態の空意味カードは draft で置換され、残りは追記される", () => {
    // defaultWordFormValues は meanings: [emptyMeaning] で始まる
    const result = mergeAiDraftIntoFormValues(formValues(), draft());
    expect(result.meanings).toHaveLength(2);
    expect(result.meanings[0]).toEqual({
      partOfSpeech: "adjective",
      pronunciation: "ɪˈfemərəl",
      texts: [{ text: "儚い" }, { text: "つかの間の" }],
      notes: [{ text: "" }],
    });
    expect(result.meanings[1].texts).toEqual([{ text: "短命なもの" }]);
  });

  test("部分入力済みの意味カードは変更せず追記になる", () => {
    const partial = { ...emptyMeaning, texts: [{ text: "手入力の訳" }] };
    const result = mergeAiDraftIntoFormValues(formValues({ meanings: [partial] }), draft());
    expect(result.meanings[0]).toEqual(partial);
    expect(result.meanings).toHaveLength(3);
  });

  test("id 付き（保存済み）の空同然カードは置換されない", () => {
    const saved = { ...emptyMeaning, id: "cjld2cjxh0000qzrmn831i7rn", texts: [{ text: "" }] };
    const result = mergeAiDraftIntoFormValues(formValues({ meanings: [saved] }), draft());
    expect(result.meanings[0]).toEqual(saved);
    expect(result.meanings).toHaveLength(3);
  });

  test("phrases は PHRASE、sentences は SENTENCE として examples に追記される", () => {
    const result = mergeAiDraftIntoFormValues(formValues(), draft());
    expect(result.examples).toEqual([
      {
        kind: "PHRASE",
        text: "ephemeral beauty",
        meaning: "儚い美しさ",
        notes: [{ text: "" }],
      },
      {
        kind: "SENTENCE",
        text: "Fame is ephemeral.",
        meaning: "名声は儚い。",
        notes: [{ text: "" }],
      },
    ]);
  });

  test("空の例文カードがあれば置換に使う", () => {
    const result = mergeAiDraftIntoFormValues(formValues({ examples: [emptyExample] }), draft());
    expect(result.examples).toHaveLength(2);
    expect(result.examples[0].kind).toBe("PHRASE");
  });

  test("再押下しても重複行は増えない（意味は訳語、例文は本文で判定）", () => {
    const once = mergeAiDraftIntoFormValues(formValues(), draft());
    const twice = mergeAiDraftIntoFormValues(once, draft());
    expect(twice).toEqual(once);
  });

  test("一部の訳語だけ既存と重なる意味は追記される", () => {
    const partial = { ...emptyMeaning, texts: [{ text: "儚い" }] };
    const result = mergeAiDraftIntoFormValues(formValues({ meanings: [partial] }), draft());
    // "儚い"+"つかの間の" の意味は片方が新規なので追加される
    expect(result.meanings).toHaveLength(3);
  });

  test("headword と対象外セクションは参照ごと変更されない", () => {
    const current = formValues({
      relatedWords: [
        {
          kind: "SYNONYM",
          term: "transient",
          partOfSpeech: "",
          pronunciation: "",
          meaning: "",
          notes: [{ text: "" }],
          linkedWordId: null,
        },
      ],
      memos: [{ text: "覚えにくい" }],
    });
    const result = mergeAiDraftIntoFormValues(current, draft());
    expect(result.headword).toBe(current.headword);
    expect(result.relatedWords).toBe(current.relatedWords);
    expect(result.memos).toBe(current.memos);
    expect(result.occurrences).toBe(current.occurrences);
  });
});
