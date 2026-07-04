import { describe, expect, test } from "vitest";

import { generateQuizForUser } from "@/lib/quiz-generate";

import { createOccurrenceRow, createQuizWordRow, createTestUser } from "../../tests/setup/fixtures";

describe("generateQuizForUser (TG four-choice, meaning-independent)", () => {
  test("生成経路全体で、意味未登録だが使える TG 例文を持つ単語を CHOICE_TG の出題対象にする", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "TG生成テスト帳");
    // 出題対象: 単語自身の意味は未登録（meanings: []）だが使える TG 例文を持つ
    const target = await createQuizWordRow(user.id, "meaningless-target", {
      meanings: [],
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
      examples: [{ text: "the meaningless target sentence", meaning: "対象の例文の意味" }],
    });
    // ダミー確保用に TG 例文つきの他単語を数語（同一 Occurrence の範囲外）
    for (let i = 0; i < 3; i++) {
      await createQuizWordRow(user.id, `dummy-${i}`, {
        occurrence: { id: occurrence.id, occurrenceNumber: 100 + i },
        examples: [{ text: `dummy sentence ${i}`, meaning: `ダミー例文${i}` }],
      });
    }

    const payload = await generateQuizForUser(user.id, {
      occurrenceId: occurrence.id,
      rangeFrom: 1,
      rangeTo: 50,
      format: "CHOICE_TG",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    });

    expect(payload.format).toBe("CHOICE_TG");
    if (payload.format !== "CHOICE_TG") throw new Error("unreachable");
    // 範囲内の出題対象は target 1 件のみ → その単語の問題が生成される
    const q = payload.questions.find((question) => question.wordId === target.id);
    expect(q).toBeDefined();
    expect(q!.prompt).toBe("the meaningless target sentence");
    expect(q!.choices[q!.correctIndex].text).toBe("対象の例文の意味");
    expect(q!.pronunciationAudioUrl).toBeNull();
  });
});
