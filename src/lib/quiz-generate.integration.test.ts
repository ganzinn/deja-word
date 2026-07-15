import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
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

  test("生成経路全体で、意味未登録だが使える TG 例文を持つ単語を SELF_JUDGE_TG の出題対象にする", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "TG自己判定生成テスト帳");
    // 出題対象: 単語自身の意味は未登録（meanings: []）だが使える TG 例文を持つ。
    // 自己判定はダミー不要のため、この 1 語だけで成立する。
    const target = await createQuizWordRow(user.id, "meaningless-target", {
      meanings: [],
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
      examples: [{ text: "the meaningless target sentence", meaning: "対象の例文の意味" }],
    });

    const payload = await generateQuizForUser(user.id, {
      occurrenceId: occurrence.id,
      rangeFrom: 1,
      rangeTo: 50,
      format: "SELF_JUDGE_TG",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    });

    expect(payload.format).toBe("SELF_JUDGE_TG");
    if (payload.format !== "SELF_JUDGE_TG") throw new Error("unreachable");
    expect(payload.questions).toHaveLength(1);
    const q = payload.questions[0];
    expect(q.wordId).toBe(target.id);
    expect(q.prompt).toBe("the meaningless target sentence");
    expect(q.answer).toBe("対象の例文の意味");
    expect(q.pronunciationAudioUrl).toBeNull();
  });
});

describe("generateQuizForUser (all-bookmark mode / bookmarkedOnly の pass-through)", () => {
  test("全件モード（掲載箇所なし＋bookmarkedOnly）はブックマーク済み単語のみ出題する（掲載番号なし・未紐付けも含む）", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "全件モード帳");
    // ブックマーク済み: 掲載番号なし・未紐付けでも全件モードでは出題対象になる（ADR-0022 の明示的例外）。
    const bmUnnumbered = await createQuizWordRow(user.id, "bm-unnumbered", {
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });
    const bmUnlinked = await createQuizWordRow(user.id, "bm-unlinked");
    // ブックマークなし（出題対象外。ダミー候補にはなりうるが SELF_JUDGE はダミー不要）。
    const other = await createQuizWordRow(user.id, "not-bookmarked", {
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
    });
    await prisma.bookmark.createMany({
      data: [
        { userId: user.id, wordId: bmUnnumbered.id },
        { userId: user.id, wordId: bmUnlinked.id },
      ],
    });

    const payload = await generateQuizForUser(user.id, {
      // occurrenceId 省略 = 全件モード
      bookmarkedOnly: true,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    });

    expect(payload.format).toBe("SELF_JUDGE");
    const askedIds = new Set(payload.questions.map((q) => q.wordId));
    expect(askedIds).toEqual(new Set([bmUnnumbered.id, bmUnlinked.id]));
    expect(askedIds.has(other.id)).toBe(false);
  });
});
