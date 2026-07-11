import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";
import {
  CONTENT_ITEMS_MAX_COUNT,
  LONG_TEXT_MAX_LENGTH,
  SHORT_TEXT_MAX_LENGTH,
} from "@/lib/schema/content-limits";
import {
  createPresetOccurrence,
  defaultWordFormValues,
  emptyOccurrence,
  wordFormSchema,
  type WordFormValues,
} from "@/lib/schema/word-form";

function validWordFormValues(overrides: Partial<WordFormValues> = {}): WordFormValues {
  return {
    headword: "ubiquitous",
    meanings: [
      {
        partOfSpeech: "",
        pronunciation: "",
        texts: [{ text: "あちこちに存在する" }],
        notes: [],
      },
    ],
    examples: [],
    relatedWords: [],
    memos: [],
    occurrences: [],
    ...overrides,
  };
}

describe("wordFormSchema", () => {
  test("accepts a minimal valid form", () => {
    const r = wordFormSchema.safeParse(validWordFormValues());
    expect(r.success).toBe(true);
  });

  test("rejects empty headword (after trim)", () => {
    const r = wordFormSchema.safeParse(validWordFormValues({ headword: "   " }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "headword")).toBe(true);
    }
  });

  test("rejects a meaning with zero texts", () => {
    const values = validWordFormValues({
      meanings: [{ partOfSpeech: "", pronunciation: "", texts: [], notes: [] }],
    });
    const r = wordFormSchema.safeParse(values);
    expect(r.success).toBe(false);
  });

  test("rejects a meaning text that is empty after trim", () => {
    const values = validWordFormValues({
      meanings: [{ partOfSpeech: "", pronunciation: "", texts: [{ text: "   " }], notes: [] }],
    });
    const r = wordFormSchema.safeParse(values);
    expect(r.success).toBe(false);
  });

  test("accepts a meaning with an enum part-of-speech key", () => {
    const values = validWordFormValues({
      meanings: [{ partOfSpeech: "verb", pronunciation: "", texts: [{ text: "走る" }], notes: [] }],
    });
    expect(wordFormSchema.safeParse(values).success).toBe(true);
  });

  test("rejects a meaning whose part-of-speech is not an enum key", () => {
    for (const pos of ["動詞", "xyz"]) {
      const values = validWordFormValues({
        meanings: [{ partOfSpeech: pos, pronunciation: "", texts: [{ text: "走る" }], notes: [] }],
      });
      const r = wordFormSchema.safeParse(values);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.join(".") === "meanings.0.partOfSpeech")).toBe(
          true,
        );
      }
    }
  });

  test("rejects a related word whose part-of-speech is not an enum key", () => {
    const values = validWordFormValues({
      relatedWords: [
        {
          kind: null,
          term: "run",
          partOfSpeech: "動詞",
          pronunciation: "",
          meaning: "",
          notes: [],
          linkedWordId: null,
        },
      ],
    });
    const r = wordFormSchema.safeParse(values);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "relatedWords.0.partOfSpeech")).toBe(
        true,
      );
    }
  });

  test("accepts a meaning with multiple notes", () => {
    const values = validWordFormValues({
      meanings: [
        {
          partOfSpeech: "",
          pronunciation: "",
          texts: [{ text: "あちこちに存在する" }],
          notes: [{ text: "フォーマル" }, { text: "文語" }],
        },
      ],
    });
    expect(wordFormSchema.safeParse(values).success).toBe(true);
  });

  test("accepts an empty note (optional — initial blank row is dropped on save)", () => {
    const values = validWordFormValues({
      meanings: [
        {
          partOfSpeech: "",
          pronunciation: "",
          texts: [{ text: "あちこちに存在する" }],
          notes: [{ text: "   " }],
        },
      ],
    });
    expect(wordFormSchema.safeParse(values).success).toBe(true);
  });

  test("accepts an empty meanings array (top-level array has no min)", () => {
    const r = wordFormSchema.safeParse(validWordFormValues({ meanings: [] }));
    expect(r.success).toBe(true);
  });

  test("accepts null occurrenceNumber", () => {
    const occ = {
      ...emptyOccurrence,
      ownerId: SYSTEM_USER_ID,
      location: "ターゲット1900",
      occurrenceNumber: null,
    };
    const r = wordFormSchema.safeParse(validWordFormValues({ occurrences: [occ] }));
    expect(r.success).toBe(true);
  });

  test("rejects occurrenceNumber 0", () => {
    const occ = {
      ...emptyOccurrence,
      ownerId: SYSTEM_USER_ID,
      location: "ターゲット1900",
      occurrenceNumber: 0,
    };
    const r = wordFormSchema.safeParse(validWordFormValues({ occurrences: [occ] }));
    expect(r.success).toBe(false);
  });

  test("rejects non-integer occurrenceNumber", () => {
    const occ = {
      ...emptyOccurrence,
      ownerId: SYSTEM_USER_ID,
      location: "ターゲット1900",
      occurrenceNumber: 1.5,
    };
    const r = wordFormSchema.safeParse(validWordFormValues({ occurrences: [occ] }));
    expect(r.success).toBe(false);
  });

  test("rejects occurrence with empty location after trim", () => {
    const occ = {
      ...emptyOccurrence,
      ownerId: SYSTEM_USER_ID,
      location: "   ",
      occurrenceNumber: null,
    };
    const r = wordFormSchema.safeParse(validWordFormValues({ occurrences: [occ] }));
    expect(r.success).toBe(false);
  });
});

describe("wordFormSchema text/array max limits (issue #107)", () => {
  test("accepts headword at exactly SHORT_TEXT_MAX_LENGTH", () => {
    const r = wordFormSchema.safeParse(
      validWordFormValues({ headword: "a".repeat(SHORT_TEXT_MAX_LENGTH) }),
    );
    expect(r.success).toBe(true);
  });

  test("rejects headword over SHORT_TEXT_MAX_LENGTH", () => {
    const r = wordFormSchema.safeParse(
      validWordFormValues({ headword: "a".repeat(SHORT_TEXT_MAX_LENGTH + 1) }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "headword")).toBe(true);
    }
  });

  test("accepts a meaning text at exactly LONG_TEXT_MAX_LENGTH (multibyte)", () => {
    const values = validWordFormValues({
      meanings: [
        {
          partOfSpeech: "",
          pronunciation: "",
          texts: [{ text: "あ".repeat(LONG_TEXT_MAX_LENGTH) }],
          notes: [],
        },
      ],
    });
    expect(wordFormSchema.safeParse(values).success).toBe(true);
  });

  test("rejects a meaning text over LONG_TEXT_MAX_LENGTH (multibyte)", () => {
    const values = validWordFormValues({
      meanings: [
        {
          partOfSpeech: "",
          pronunciation: "",
          texts: [{ text: "あ".repeat(LONG_TEXT_MAX_LENGTH + 1) }],
          notes: [],
        },
      ],
    });
    const r = wordFormSchema.safeParse(values);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "meanings.0.texts.0.text")).toBe(true);
    }
  });

  const overShort = "a".repeat(SHORT_TEXT_MAX_LENGTH + 1);
  const overLong = "a".repeat(LONG_TEXT_MAX_LENGTH + 1);
  const meaningWith = (overrides: Partial<WordFormValues["meanings"][number]>) =>
    validWordFormValues({
      meanings: [
        { partOfSpeech: "", pronunciation: "", texts: [{ text: "意味" }], notes: [], ...overrides },
      ],
    });
  const exampleWith = (overrides: Partial<WordFormValues["examples"][number]>) =>
    validWordFormValues({
      examples: [{ kind: "SENTENCE", text: "例文", meaning: "", notes: [], ...overrides }],
    });
  const relatedWith = (overrides: Partial<WordFormValues["relatedWords"][number]>) =>
    validWordFormValues({
      relatedWords: [
        {
          kind: null,
          term: "run",
          partOfSpeech: "",
          pronunciation: "",
          meaning: "",
          notes: [],
          linkedWordId: null,
          ...overrides,
        },
      ],
    });
  const occurrenceWith = (overrides: Partial<WordFormValues["occurrences"][number]>) =>
    validWordFormValues({
      occurrences: [
        {
          ...emptyOccurrence,
          ownerId: SYSTEM_USER_ID,
          location: "ターゲット1900",
          occurrenceNumber: null,
          ...overrides,
        },
      ],
    });

  const overLengthCases: [string, WordFormValues][] = [
    ["meanings.0.pronunciation", meaningWith({ pronunciation: overShort })],
    ["meanings.0.notes.0.text", meaningWith({ notes: [{ text: overLong }] })],
    ["examples.0.text", exampleWith({ text: overLong })],
    ["examples.0.meaning", exampleWith({ meaning: overLong })],
    ["examples.0.notes.0.text", exampleWith({ notes: [{ text: overLong }] })],
    ["relatedWords.0.term", relatedWith({ term: overShort })],
    ["relatedWords.0.pronunciation", relatedWith({ pronunciation: overShort })],
    ["relatedWords.0.meaning", relatedWith({ meaning: overLong })],
    ["relatedWords.0.notes.0.text", relatedWith({ notes: [{ text: overLong }] })],
    ["memos.0.text", validWordFormValues({ memos: [{ text: overLong }] })],
    ["occurrences.0.location", occurrenceWith({ location: overShort })],
    ["occurrences.0.details.0.detail", occurrenceWith({ details: [{ detail: overLong }] })],
  ];

  test.each(overLengthCases)("rejects over-length text at %s", (path, values) => {
    const r = wordFormSchema.safeParse(values);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === path)).toBe(true);
    }
  });

  test("accepts meanings at exactly CONTENT_ITEMS_MAX_COUNT items", () => {
    const meanings = Array.from({ length: CONTENT_ITEMS_MAX_COUNT }, () => ({
      partOfSpeech: "",
      pronunciation: "",
      texts: [{ text: "意味" }],
      notes: [],
    }));
    expect(wordFormSchema.safeParse(validWordFormValues({ meanings })).success).toBe(true);
  });

  test("rejects meanings over CONTENT_ITEMS_MAX_COUNT items", () => {
    const meanings = Array.from({ length: CONTENT_ITEMS_MAX_COUNT + 1 }, () => ({
      partOfSpeech: "",
      pronunciation: "",
      texts: [{ text: "意味" }],
      notes: [],
    }));
    const r = wordFormSchema.safeParse(validWordFormValues({ meanings }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "meanings")).toBe(true);
    }
  });

  test("rejects nested meaning texts over CONTENT_ITEMS_MAX_COUNT items", () => {
    const texts = Array.from({ length: CONTENT_ITEMS_MAX_COUNT + 1 }, () => ({ text: "意味" }));
    const r = wordFormSchema.safeParse(meaningWith({ texts }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "meanings.0.texts")).toBe(true);
    }
  });

  test("rejects memos over CONTENT_ITEMS_MAX_COUNT items", () => {
    const memos = Array.from({ length: CONTENT_ITEMS_MAX_COUNT + 1 }, () => ({ text: "メモ" }));
    const r = wordFormSchema.safeParse(validWordFormValues({ memos }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "memos")).toBe(true);
    }
  });
});

describe("createPresetOccurrence", () => {
  test("carries the preset ownerId into occurrenceOwnerId (system case)", () => {
    const preset = createPresetOccurrence({
      id: "occ_1",
      ownerId: SYSTEM_USER_ID,
      location: "ターゲット1900",
    });
    expect(preset.occurrenceId).toBe("occ_1");
    expect(preset.occurrenceOwnerId).toBe(SYSTEM_USER_ID);
    expect(preset.location).toBe("ターゲット1900");
    expect(preset.occurrenceNumber).toBeNull();
    expect(preset.details).toEqual([{ detail: "" }]);
  });

  test("carries the preset ownerId into occurrenceOwnerId (user-owned case)", () => {
    const preset = createPresetOccurrence({
      id: "occ_2",
      ownerId: "user_xyz",
      location: "自分のもの",
    });
    expect(preset.occurrenceOwnerId).toBe("user_xyz");
  });

  test("defaults occurrenceNumber to null when not provided", () => {
    const preset = createPresetOccurrence({ id: "occ_3", ownerId: "u", location: "L" });
    expect(preset.occurrenceNumber).toBeNull();
  });

  test("uses the given occurrenceNumber (auto-numbering)", () => {
    const preset = createPresetOccurrence({ id: "occ_4", ownerId: "u", location: "L" }, 5);
    expect(preset.occurrenceNumber).toBe(5);
  });
});

describe("defaultWordFormValues", () => {
  test("has one empty meaning with one empty text slot", () => {
    expect(defaultWordFormValues.meanings).toHaveLength(1);
    expect(defaultWordFormValues.meanings[0]?.texts).toEqual([{ text: "" }]);
  });

  test("does not validate (headword is empty) — used only as form initial state", () => {
    const r = wordFormSchema.safeParse(defaultWordFormValues);
    expect(r.success).toBe(false);
  });
});
