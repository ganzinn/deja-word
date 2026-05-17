import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";
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
        note: "",
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
      meanings: [{ partOfSpeech: "", pronunciation: "", texts: [], note: "" }],
    });
    const r = wordFormSchema.safeParse(values);
    expect(r.success).toBe(false);
  });

  test("rejects a meaning text that is empty after trim", () => {
    const values = validWordFormValues({
      meanings: [{ partOfSpeech: "", pronunciation: "", texts: [{ text: "   " }], note: "" }],
    });
    const r = wordFormSchema.safeParse(values);
    expect(r.success).toBe(false);
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

describe("createPresetOccurrence", () => {
  test("sets occurrenceOwnerId to SYSTEM_USER_ID and carries through id+location", () => {
    const preset = createPresetOccurrence({ id: "occ_1", location: "ターゲット1900" });
    expect(preset.occurrenceId).toBe("occ_1");
    expect(preset.occurrenceOwnerId).toBe(SYSTEM_USER_ID);
    expect(preset.location).toBe("ターゲット1900");
    expect(preset.occurrenceNumber).toBeNull();
    expect(preset.details).toEqual([{ detail: "" }]);
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
