import { describe, expect, test } from "vitest";

import { occurrenceNumbersOf, orderQuestionsByOccurrenceNumber } from "./order";

function question(wordId: string, headword: string) {
  return { wordId, headword, pronunciationAudioUrl: null, ttsText: headword };
}

describe("occurrenceNumbersOf", () => {
  test("maps wordId to the occurrence number of the target occurrence link", () => {
    const numbers = occurrenceNumbersOf([
      { id: "w1", wordOccurrences: [{ occurrenceNumber: 30 }] },
      { id: "w2", wordOccurrences: [{ occurrenceNumber: 10 }] },
    ]);
    expect([...numbers]).toEqual([
      ["w1", 30],
      ["w2", 10],
    ]);
  });

  test("skips words without a link (全件モード) or without a number", () => {
    const numbers = occurrenceNumbersOf([
      { id: "unlinked", wordOccurrences: [] },
      { id: "unnumbered", wordOccurrences: [{ occurrenceNumber: null }] },
      { id: "numbered", wordOccurrences: [{ occurrenceNumber: 1 }] },
    ]);
    expect(numbers.has("unlinked")).toBe(false);
    expect(numbers.has("unnumbered")).toBe(false);
    expect(numbers.get("numbered")).toBe(1);
  });
});

describe("orderQuestionsByOccurrenceNumber", () => {
  const numbers = new Map([
    ["a", 3],
    ["b", 1],
    ["c", 2],
  ]);

  test("sorts questions by ascending occurrence number", () => {
    const ordered = orderQuestionsByOccurrenceNumber(
      [question("a", "apple"), question("b", "banana"), question("c", "cherry")],
      numbers,
    );
    expect(ordered.map((q) => q.wordId)).toEqual(["b", "c", "a"]);
  });

  test("does not mutate the input array", () => {
    const input = [question("a", "apple"), question("b", "banana")];
    orderQuestionsByOccurrenceNumber(input, numbers);
    expect(input.map((q) => q.wordId)).toEqual(["a", "b"]);
  });

  test("places numberless questions last, tie-broken by headword", () => {
    const ordered = orderQuestionsByOccurrenceNumber(
      [question("zzz", "zebra"), question("yyy", "ant"), question("b", "banana")],
      numbers,
    );
    expect(ordered.map((q) => q.wordId)).toEqual(["b", "yyy", "zzz"]);
  });
});
