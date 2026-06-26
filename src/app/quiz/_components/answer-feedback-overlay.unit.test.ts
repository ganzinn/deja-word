import { describe, expect, test } from "vitest";

import { feedbackKindForResult } from "./answer-feedback-overlay";

describe("feedbackKindForResult", () => {
  test("CORRECT は正解フラッシュ（○）", () => {
    expect(feedbackKindForResult("CORRECT")).toBe("correct");
  });

  test("INCORRECT は不正解フラッシュ（×）", () => {
    expect(feedbackKindForResult("INCORRECT")).toBe("incorrect");
  });

  test("TIMEOUT は×と同じ扱い（不正解フラッシュ）", () => {
    expect(feedbackKindForResult("TIMEOUT")).toBe("incorrect");
  });

  test("GAVE_UP は中立（表示も音もなし）", () => {
    expect(feedbackKindForResult("GAVE_UP")).toBeNull();
  });

  test("VAGUE（うろ覚え）は中立（表示も音もなし）", () => {
    expect(feedbackKindForResult("VAGUE")).toBeNull();
  });
});
