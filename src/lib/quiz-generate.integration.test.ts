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
      orderByOccurrenceNumber: false,
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
      orderByOccurrenceNumber: false,
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
      orderByOccurrenceNumber: false,
    });

    expect(payload.format).toBe("SELF_JUDGE");
    const askedIds = new Set(payload.questions.map((q) => q.wordId));
    expect(askedIds).toEqual(new Set([bmUnnumbered.id, bmUnlinked.id]));
    expect(askedIds.has(other.id)).toBe(false);
  });
});

describe("generateQuizForUser (掲載番号順出題 / docs/adr/0072-quiz-order-by-occurrence-number.md)", () => {
  /** 掲載番号を降順に登録した単語（登録順と掲載番号順が一致しないようにする）。 */
  async function createNumberedWords(userId: string, occurrenceId: string, numbers: number[]) {
    const byNumber = new Map<number, string>();
    for (const number of numbers) {
      const word = await createQuizWordRow(userId, `word-${number}`, {
        occurrence: { id: occurrenceId, occurrenceNumber: number },
      });
      byNumber.set(number, word.id);
    }
    return byNumber;
  }

  test("orderByOccurrenceNumber: true で掲載番号の昇順に出題する", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "番号順テスト帳");
    // 登録順は 5,4,3,2,1（＝掲載番号の降順）。番号順出題なら 1..5 の昇順で返る。
    const byNumber = await createNumberedWords(user.id, occurrence.id, [5, 4, 3, 2, 1]);

    const payload = await generateQuizForUser(user.id, {
      occurrenceId: occurrence.id,
      rangeFrom: 1,
      rangeTo: 5,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      orderByOccurrenceNumber: true,
    });

    expect(payload.questions.map((q) => q.wordId)).toEqual([
      byNumber.get(1),
      byNumber.get(2),
      byNumber.get(3),
      byNumber.get(4),
      byNumber.get(5),
    ]);
  });

  test("全件モード（掲載箇所なし）では orderByOccurrenceNumber: true でも無視する（掲載番号が無いため）", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "全件モード番号順テスト帳");
    const byNumber = await createNumberedWords(user.id, occurrence.id, [1, 2, 3]);
    await prisma.bookmark.createMany({
      data: [...byNumber.values()].map((wordId) => ({ userId: user.id, wordId })),
    });

    // 掲載箇所を指定していないので並べ替えキーが無く、出題は成立する（順序は保証しない）。
    const payload = await generateQuizForUser(user.id, {
      bookmarkedOnly: true,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      orderByOccurrenceNumber: true,
    });

    expect(new Set(payload.questions.map((q) => q.wordId))).toEqual(new Set(byNumber.values()));
  });
});

describe("generateQuizForUser (出題数指定 / docs/adr/0074-quiz-question-count-sampling.md)", () => {
  /** 掲載番号 1..count の単語を登録し、番号 → wordId の map を返す。 */
  async function createRangeWords(userId: string, occurrenceId: string, count: number) {
    const byNumber = new Map<number, string>();
    for (let number = 1; number <= count; number++) {
      const word = await createQuizWordRow(userId, `word-${number}`, {
        occurrence: { id: occurrenceId, occurrenceNumber: number },
      });
      byNumber.set(number, word.id);
    }
    return byNumber;
  }

  test("questionCount < 対象数のときは範囲内から重複なしで N 問だけ出題する", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "出題数テスト帳");
    const byNumber = await createRangeWords(user.id, occurrence.id, 10);

    const payload = await generateQuizForUser(user.id, {
      occurrenceId: occurrence.id,
      rangeFrom: 1,
      rangeTo: 10,
      questionCount: 3,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      orderByOccurrenceNumber: false,
    });

    const askedIds = payload.questions.map((q) => q.wordId);
    expect(askedIds).toHaveLength(3);
    expect(new Set(askedIds).size).toBe(3);
    const rangeIds = new Set(byNumber.values());
    for (const id of askedIds) expect(rangeIds.has(id)).toBe(true);
  });

  test("questionCount ≥ 対象数のときは全問出題する（min 挙動。エラーにしない）", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "出題数min挙動テスト帳");
    const byNumber = await createRangeWords(user.id, occurrence.id, 3);

    const payload = await generateQuizForUser(user.id, {
      occurrenceId: occurrence.id,
      rangeFrom: 1,
      rangeTo: 3,
      questionCount: 100,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      orderByOccurrenceNumber: false,
    });

    expect(new Set(payload.questions.map((q) => q.wordId))).toEqual(new Set(byNumber.values()));
  });

  test("questionCount 未指定は従来どおり全問出題する（回帰）", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "出題数未指定テスト帳");
    const byNumber = await createRangeWords(user.id, occurrence.id, 5);

    const payload = await generateQuizForUser(user.id, {
      occurrenceId: occurrence.id,
      rangeFrom: 1,
      rangeTo: 5,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      orderByOccurrenceNumber: false,
    });

    expect(new Set(payload.questions.map((q) => q.wordId))).toEqual(new Set(byNumber.values()));
  });

  test("掲載番号順 ON と併用すると、抽選された N 問が掲載番号の昇順で並ぶ", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "出題数×番号順テスト帳");
    const byNumber = await createRangeWords(user.id, occurrence.id, 10);
    const numberById = new Map([...byNumber].map(([number, id]) => [id, number]));

    const payload = await generateQuizForUser(user.id, {
      occurrenceId: occurrence.id,
      rangeFrom: 1,
      rangeTo: 10,
      questionCount: 4,
      format: "SELF_JUDGE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      orderByOccurrenceNumber: true,
    });

    const askedNumbers = payload.questions.map((q) => numberById.get(q.wordId)!);
    expect(askedNumbers).toHaveLength(4);
    expect(askedNumbers).toEqual([...askedNumbers].sort((a, b) => a - b));
  });

  test("四択でも抽選外の範囲内単語がダミー候補に回り、対象 1 問でも成立する", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "出題数ダミー確保テスト帳");
    // 範囲内 4 語のみ（範囲外・他 Occurrence の単語なし）。全問出題なら互いがダミー候補。
    // questionCount: 1 で抽選外の 3 語がダミー候補プールへ回らないと CHOICE が成立しない。
    const byNumber = await createRangeWords(user.id, occurrence.id, 4);

    const payload = await generateQuizForUser(user.id, {
      occurrenceId: occurrence.id,
      rangeFrom: 1,
      rangeTo: 4,
      questionCount: 1,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
      orderByOccurrenceNumber: false,
    });

    expect(payload.format).toBe("CHOICE");
    if (payload.format !== "CHOICE") throw new Error("unreachable");
    expect(payload.questions).toHaveLength(1);
    expect(new Set(byNumber.values()).has(payload.questions[0].wordId)).toBe(true);
    // 四択の選択肢（正解 1 + ダミー）が構成されている = 抽選外の単語がダミーに使えている
    expect(payload.questions[0].choices.length).toBeGreaterThan(1);
  });
});
