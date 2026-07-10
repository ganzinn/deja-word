import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";
import { defaultWordFormValues, type WordFormValues } from "@/lib/schema/word-form";
import {
  assertHeadwordChangeAllowed,
  assertNoPreexistingChildIds,
  assertRowsAllowed,
  assertWordDeletable,
  assertWordUpdateAllowed,
  ForbiddenDeleteError,
  ForbiddenUpdateError,
  isPassThroughSystemRow,
  isSystemOwned,
  type WordUpdateLoadedRows,
} from "@/lib/words/policy/row-policy";

const editor = { userId: "u1", isSystem: false };
const sysEditor = { userId: SYSTEM_USER_ID, isSystem: true };

function makeValues(overrides: Partial<WordFormValues> = {}): WordFormValues {
  return { ...defaultWordFormValues, meanings: [], occurrences: [], ...overrides };
}

function makeLoaded(overrides: Partial<WordUpdateLoadedRows> = {}): WordUpdateLoadedRows {
  return {
    meanings: [],
    examples: [],
    relatedWords: [],
    memos: [],
    wordOccurrences: [],
    meaningTexts: [],
    meaningNotes: [],
    exampleNotes: [],
    relatedWordNotes: [],
    occurrenceDetails: [],
    ...overrides,
  };
}

describe("isSystemOwned / isPassThroughSystemRow", () => {
  test("isSystemOwned reflects the system marker", () => {
    expect(isSystemOwned(SYSTEM_USER_ID)).toBe(true);
    expect(isSystemOwned("u1")).toBe(false);
  });

  test("pass-through is system row seen by a non-system editor only", () => {
    expect(isPassThroughSystemRow(editor, SYSTEM_USER_ID)).toBe(true);
    expect(isPassThroughSystemRow(sysEditor, SYSTEM_USER_ID)).toBe(false);
    expect(isPassThroughSystemRow(editor, "u1")).toBe(false);
  });

  test("an unset owner (new row) is neither system nor pass-through", () => {
    expect(isSystemOwned(undefined)).toBe(false);
    expect(isPassThroughSystemRow(editor, undefined)).toBe(false);
  });
});

describe("assertWordDeletable", () => {
  test("allows deletion when all descendants share the word owner", () => {
    expect(() =>
      assertWordDeletable(SYSTEM_USER_ID, [SYSTEM_USER_ID, SYSTEM_USER_ID]),
    ).not.toThrow();
    expect(() => assertWordDeletable("u1", ["u1"])).not.toThrow();
    expect(() => assertWordDeletable("u1", [])).not.toThrow();
  });

  test("blocks deletion when a descendant is owned by someone else (pass-through)", () => {
    // system 単語に一般ユーザーが付けた子孫がある
    expect(() => assertWordDeletable(SYSTEM_USER_ID, [SYSTEM_USER_ID, "u1"])).toThrow(
      ForbiddenDeleteError,
    );
  });
});

describe("assertHeadwordChangeAllowed", () => {
  test("blocks a non-system editor changing a system word's headword", () => {
    expect(() =>
      assertHeadwordChangeAllowed(editor, { ownerId: SYSTEM_USER_ID, headword: "old" }, "new"),
    ).toThrow(ForbiddenUpdateError);
  });

  test("allows keeping the same headword on a system word", () => {
    expect(() =>
      assertHeadwordChangeAllowed(editor, { ownerId: SYSTEM_USER_ID, headword: "old" }, "old"),
    ).not.toThrow();
  });

  test("allows a non-system editor changing their own word's headword", () => {
    expect(() =>
      assertHeadwordChangeAllowed(editor, { ownerId: "u1", headword: "old" }, "new"),
    ).not.toThrow();
  });

  test("allows a system editor changing a system word's headword", () => {
    expect(() =>
      assertHeadwordChangeAllowed(sysEditor, { ownerId: SYSTEM_USER_ID, headword: "old" }, "new"),
    ).not.toThrow();
  });
});

describe("assertRowsAllowed", () => {
  test("rejects a form row referencing an unknown id", () => {
    expect(() =>
      assertRowsAllowed("meaning", editor, [{ id: "ghost", ownerId: "u1" }], []),
    ).toThrow(/unknown id ghost/);
  });

  test("rejects an owner mismatch on an existing id", () => {
    expect(() =>
      assertRowsAllowed(
        "meaning",
        editor,
        [{ id: "m1", ownerId: "u1" }],
        [{ id: "m1", ownerId: SYSTEM_USER_ID }],
      ),
    ).toThrow(/owner mismatch on m1/);
  });

  test("rejects a row owned by a different (non-system) user", () => {
    expect(() => assertRowsAllowed("example", editor, [{ ownerId: "other" }], [])).toThrow(
      /ownerId other not allowed/,
    );
  });

  test("rejects a non-system editor deleting a system row", () => {
    expect(() =>
      assertRowsAllowed("meaning", editor, [], [{ id: "m1", ownerId: SYSTEM_USER_ID }]),
    ).toThrow(/system row m1 cannot be deleted/);
  });

  test("allows a system editor to delete a system row", () => {
    expect(() =>
      assertRowsAllowed("meaning", sysEditor, [], [{ id: "m1", ownerId: SYSTEM_USER_ID }]),
    ).not.toThrow();
  });

  test("allows pass-through of a kept system row", () => {
    expect(() =>
      assertRowsAllowed(
        "meaning",
        editor,
        [{ id: "m1", ownerId: SYSTEM_USER_ID }],
        [{ id: "m1", ownerId: SYSTEM_USER_ID }],
      ),
    ).not.toThrow();
  });

  test("allows editing the editor's own row", () => {
    expect(() =>
      assertRowsAllowed(
        "meaning",
        editor,
        [{ id: "m1", ownerId: "u1" }],
        [{ id: "m1", ownerId: "u1" }],
      ),
    ).not.toThrow();
  });

  test("allows a brand-new row whose owner is unset", () => {
    expect(() => assertRowsAllowed("meaning", editor, [{ ownerId: "" }], [])).not.toThrow();
    expect(() => assertRowsAllowed("meaning", editor, [{}], [])).not.toThrow();
  });
});

describe("assertWordUpdateAllowed", () => {
  test("blocks deleting an own meaning that has a non-editor text attached", () => {
    expect(() =>
      assertWordUpdateAllowed(
        editor,
        { ownerId: "u1", headword: "x" },
        makeValues({ headword: "x" }),
        makeLoaded({
          meanings: [{ id: "m1", ownerId: "u1" }],
          meaningTexts: [{ id: "t1", ownerId: SYSTEM_USER_ID, meaningId: "m1" }],
        }),
      ),
    ).toThrow(/meaning m1 has attached non-editor texts/);
  });

  test("blocks deleting an own wordOccurrence that has a non-editor detail attached", () => {
    expect(() =>
      assertWordUpdateAllowed(
        editor,
        { ownerId: "u1", headword: "x" },
        makeValues({ headword: "x" }),
        makeLoaded({
          wordOccurrences: [{ id: "wo1", ownerId: "u1" }],
          occurrenceDetails: [{ id: "d1", ownerId: SYSTEM_USER_ID, wordOccurrenceId: "wo1" }],
        }),
      ),
    ).toThrow(/wordOccurrence wo1 has attached non-editor details/);
  });

  test("passes when every row is within the editor's authority", () => {
    expect(() =>
      assertWordUpdateAllowed(
        editor,
        { ownerId: "u1", headword: "x" },
        makeValues({
          headword: "x",
          meanings: [{ id: "m1", ownerId: "u1", texts: [{ text: "a" }], notes: [] }],
        }),
        makeLoaded({ meanings: [{ id: "m1", ownerId: "u1" }] }),
      ),
    ).not.toThrow();
  });

  test("blocks a non-system editor dropping a system meaningText during pass-through", () => {
    expect(() =>
      assertWordUpdateAllowed(
        editor,
        { ownerId: SYSTEM_USER_ID, headword: "x" },
        makeValues({
          headword: "x",
          meanings: [{ id: "m1", ownerId: SYSTEM_USER_ID, texts: [{ text: "mine" }], notes: [] }],
        }),
        makeLoaded({
          meanings: [{ id: "m1", ownerId: SYSTEM_USER_ID }],
          meaningTexts: [{ id: "t1", ownerId: SYSTEM_USER_ID, meaningId: "m1" }],
        }),
      ),
    ).toThrow(/meaningText: system row t1 cannot be deleted/);
  });

  test("blocks a non-system editor dropping a system meaningNote during pass-through", () => {
    expect(() =>
      assertWordUpdateAllowed(
        editor,
        { ownerId: SYSTEM_USER_ID, headword: "x" },
        makeValues({
          headword: "x",
          meanings: [{ id: "m1", ownerId: SYSTEM_USER_ID, texts: [{ text: "keep" }], notes: [] }],
        }),
        makeLoaded({
          meanings: [{ id: "m1", ownerId: SYSTEM_USER_ID }],
          meaningNotes: [{ id: "n1", ownerId: SYSTEM_USER_ID, meaningId: "m1" }],
        }),
      ),
    ).toThrow(/meaningNote: system row n1 cannot be deleted/);
  });

  test("allows a non-system editor appending their own note to a system related word", () => {
    expect(() =>
      assertWordUpdateAllowed(
        editor,
        { ownerId: SYSTEM_USER_ID, headword: "x" },
        makeValues({
          headword: "x",
          relatedWords: [
            {
              id: "r1",
              ownerId: SYSTEM_USER_ID,
              kind: null,
              term: "syn",
              partOfSpeech: "",
              pronunciation: "",
              meaning: "",
              notes: [{ id: "n1", ownerId: SYSTEM_USER_ID, text: "共通" }, { text: "自分の補足" }],
              linkedWordId: null,
            },
          ],
        }),
        makeLoaded({
          relatedWords: [{ id: "r1", ownerId: SYSTEM_USER_ID }],
          relatedWordNotes: [{ id: "n1", ownerId: SYSTEM_USER_ID, relatedWordId: "r1" }],
        }),
      ),
    ).not.toThrow();
  });

  test("blocks a non-system editor dropping a system occurrenceDetail during pass-through", () => {
    expect(() =>
      assertWordUpdateAllowed(
        editor,
        { ownerId: SYSTEM_USER_ID, headword: "x" },
        makeValues({
          headword: "x",
          occurrences: [
            {
              id: "wo1",
              ownerId: SYSTEM_USER_ID,
              location: "ターゲット1900",
              occurrenceNumber: null,
              details: [{ detail: "mine" }],
            },
          ],
        }),
        makeLoaded({
          wordOccurrences: [{ id: "wo1", ownerId: SYSTEM_USER_ID }],
          occurrenceDetails: [{ id: "d1", ownerId: SYSTEM_USER_ID, wordOccurrenceId: "wo1" }],
        }),
      ),
    ).toThrow(/occurrenceDetail: system row d1 cannot be deleted/);
  });

  test("propagates a forbidden headword change from the orchestrator", () => {
    expect(() =>
      assertWordUpdateAllowed(
        editor,
        { ownerId: SYSTEM_USER_ID, headword: "old" },
        makeValues({ headword: "new" }),
        makeLoaded(),
      ),
    ).toThrow(ForbiddenUpdateError);
  });
});

describe("assertNoPreexistingChildIds", () => {
  // 既存行になりすます注入値。作成経路ではどの位置でも拒否される
  const injected = { id: "row1", ownerId: SYSTEM_USER_ID };

  test("passes for a form without any row ids", () => {
    expect(() =>
      assertNoPreexistingChildIds(
        makeValues({
          meanings: [
            {
              partOfSpeech: "",
              pronunciation: "",
              texts: [{ text: "意味" }],
              notes: [{ text: "補足" }],
            },
          ],
          examples: [{ kind: "SENTENCE", text: "ex", meaning: "", notes: [{ text: "" }] }],
          relatedWords: [
            {
              kind: null,
              term: "syn",
              partOfSpeech: "",
              pronunciation: "",
              meaning: "",
              notes: [{ text: "" }],
              linkedWordId: null,
            },
          ],
          memos: [{ text: "メモ" }],
          occurrences: [
            {
              ownerId: "",
              location: "ターゲット1900",
              occurrenceNumber: null,
              details: [{ detail: "" }],
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  test.each<[string, Partial<WordFormValues>]>([
    [
      "meanings[].id",
      {
        meanings: [
          {
            ...injected,
            partOfSpeech: "",
            pronunciation: "",
            texts: [{ text: "意味" }],
            notes: [],
          },
        ],
      },
    ],
    [
      "meanings[].texts[].id",
      {
        meanings: [
          {
            partOfSpeech: "",
            pronunciation: "",
            texts: [{ ...injected, text: "意味" }],
            notes: [],
          },
        ],
      },
    ],
    [
      "meanings[].notes[].id",
      {
        meanings: [
          {
            partOfSpeech: "",
            pronunciation: "",
            texts: [{ text: "意味" }],
            notes: [{ ...injected, text: "補足" }],
          },
        ],
      },
    ],
    [
      "examples[].id",
      { examples: [{ ...injected, kind: "SENTENCE", text: "ex", meaning: "", notes: [] }] },
    ],
    [
      "examples[].notes[].id",
      {
        examples: [
          { kind: "SENTENCE", text: "ex", meaning: "", notes: [{ ...injected, text: "補足" }] },
        ],
      },
    ],
    [
      "relatedWords[].id",
      {
        relatedWords: [
          {
            ...injected,
            kind: null,
            term: "syn",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            notes: [],
            linkedWordId: null,
          },
        ],
      },
    ],
    [
      "relatedWords[].notes[].id",
      {
        relatedWords: [
          {
            kind: null,
            term: "syn",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            notes: [{ ...injected, text: "補足" }],
            linkedWordId: null,
          },
        ],
      },
    ],
    ["memos[].id", { memos: [{ ...injected, text: "メモ" }] }],
    [
      "occurrences[].id",
      {
        occurrences: [
          { ...injected, location: "ターゲット1900", occurrenceNumber: null, details: [] },
        ],
      },
    ],
    [
      "occurrences[].details[].id",
      {
        occurrences: [
          {
            ownerId: "",
            location: "ターゲット1900",
            occurrenceNumber: null,
            details: [{ ...injected, detail: "詳細" }],
          },
        ],
      },
    ],
  ])("rejects a preexisting id at %s", (_position, overrides) => {
    expect(() => assertNoPreexistingChildIds(makeValues(overrides))).toThrow(ForbiddenUpdateError);
  });

  test("allows occurrenceId (preset FK) when the row itself has no id", () => {
    expect(() =>
      assertNoPreexistingChildIds(
        makeValues({
          occurrences: [
            {
              occurrenceId: "occ1",
              ownerId: "",
              occurrenceOwnerId: SYSTEM_USER_ID,
              location: "ターゲット1900",
              occurrenceNumber: 1,
              details: [{ detail: "" }],
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  test("allows linkedWordId when the row itself has no id", () => {
    expect(() =>
      assertNoPreexistingChildIds(
        makeValues({
          relatedWords: [
            {
              kind: "SYNONYM",
              term: "syn",
              partOfSpeech: "",
              pronunciation: "",
              meaning: "",
              notes: [],
              linkedWordId: "w1",
            },
          ],
        }),
      ),
    ).not.toThrow();
  });
});
