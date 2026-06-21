import { describe, expect, test } from "vitest";

import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import {
  countQuizSourceExclusions,
  countQuizTargets,
  DUMMY_POOL_SIZE,
  fetchQuizSource,
} from "@/lib/quiz/queries/quiz-source";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import {
  createOccurrenceRow,
  createQuizWordRow,
  createTestUser,
  getSystemOccurrence,
  SYSTEM_OCCURRENCE_LOCATIONS,
} from "../../../../tests/setup/fixtures";

describe("fetchQuizSource", () => {
  test("returns own and system words, but not a foreign user's words", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const occurrence = await getSystemOccurrence(SYSTEM_OCCURRENCE_LOCATIONS[0]);
    const ownWord = await createQuizWordRow(user.id, "own", {
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
    });
    const systemWord = await createQuizWordRow(SYSTEM_USER_ID, "system", {
      occurrence: { id: occurrence.id, occurrenceNumber: 2 },
    });
    const strangerWord = await createQuizWordRow(stranger.id, "stranger", {
      occurrence: { id: occurrence.id, occurrenceNumber: 3 },
    });

    const { targetRows } = await fetchQuizSource(user.id, occurrence.id, {});
    const ids = targetRows.map((r) => r.id);
    expect(ids).toContain(ownWord.id);
    expect(ids).toContain(systemWord.id);
    expect(ids).not.toContain(strangerWord.id);
  });

  test("excludes words without any MeaningText (no meaning / empty texts)", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "範囲テスト帳");
    const withMeaning = await createQuizWordRow(user.id, "alpha", {
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
    });
    const noMeaning = await createQuizWordRow(user.id, "beta", {
      meanings: [],
      occurrence: { id: occurrence.id, occurrenceNumber: 2 },
    });
    const emptyTexts = await createQuizWordRow(user.id, "gamma", {
      meanings: [{ texts: [] }],
      occurrence: { id: occurrence.id, occurrenceNumber: 3 },
    });

    const { targetRows } = await fetchQuizSource(user.id, occurrence.id, {});
    const ids = targetRows.map((r) => r.id);
    expect(ids).toContain(withMeaning.id);
    expect(ids).not.toContain(noMeaning.id);
    expect(ids).not.toContain(emptyTexts.id);
  });

  test("splits rows into target (in range) / same-occurrence (out of range or no number) / fallback (other occurrence)", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "番号テスト帳");
    const other = await createOccurrenceRow(user.id, "別の出典", 1);
    const inRange = await createQuizWordRow(user.id, "inrange", {
      occurrence: { id: occurrence.id, occurrenceNumber: 7 },
    });
    const outOfRange = await createQuizWordRow(user.id, "outofrange", {
      occurrence: { id: occurrence.id, occurrenceNumber: 99 },
    });
    const noNumber = await createQuizWordRow(user.id, "nonumber", {
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });
    const otherOccurrence = await createQuizWordRow(user.id, "elsewhere", {
      occurrence: { id: other.id, occurrenceNumber: 1 },
    });

    const { targetRows, sameOccurrenceRows, fallbackRows } = await fetchQuizSource(
      user.id,
      occurrence.id,
      { from: 1, to: 50 },
    );
    // 範囲内（occurrenceNumber 7）は出題対象
    expect(targetRows.map((r) => r.id)).toEqual([inRange.id]);
    // 範囲外（99）・番号なしは同一 Occurrence プール（ダミー専用）
    expect(sameOccurrenceRows.map((r) => r.id).sort()).toEqual([noNumber.id, outOfRange.id].sort());
    // 別 Occurrence の単語は補完プール
    expect(fallbackRows.map((r) => r.id)).toEqual([otherOccurrence.id]);
  });

  test("returns meanings with texts ordered by sortOrder", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "意味テスト帳");
    const word = await createQuizWordRow(user.id, "delta", {
      meanings: [{ texts: ["第一の意味", "第二の意味"] }, { texts: ["別品詞の意味"] }],
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
    });

    const { targetRows } = await fetchQuizSource(user.id, occurrence.id, {});
    const row = targetRows.find((r) => r.id === word.id);
    expect(row).toBeDefined();
    expect(row!.headword).toBe("delta");
    expect(row!.meanings).toHaveLength(2);
    expect(row!.meanings[0].texts.map((t) => t.text)).toEqual(["第一の意味", "第二の意味"]);
    expect(row!.meanings[1].texts.map((t) => t.text)).toEqual(["別品詞の意味"]);
  });

  test("fills the dummy pool up to DUMMY_POOL_SIZE from same-occurrence first (fallback skipped)", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "不足分テスト帳");
    const targetCount = 10;
    await Promise.all(
      Array.from({ length: targetCount }, (_, i) =>
        createQuizWordRow(user.id, `target${i}`, {
          occurrence: { id: occurrence.id, occurrenceNumber: i + 1 },
        }),
      ),
    );
    // 範囲外の同一 Occurrence 単語を不足分（DUMMY_POOL_SIZE - targets）より多く投入
    await Promise.all(
      Array.from({ length: DUMMY_POOL_SIZE }, (_, i) =>
        createQuizWordRow(user.id, `sameocc${i}`, {
          occurrence: { id: occurrence.id, occurrenceNumber: 1000 + i },
        }),
      ),
    );
    // 他 Occurrence の単語も用意するが、同一 Occurrence で充足するため取得されないはず
    await createQuizWordRow(user.id, "other");

    const { targetRows, sameOccurrenceRows, fallbackRows } = await fetchQuizSource(
      user.id,
      occurrence.id,
      { from: 1, to: 50 },
    );
    expect(targetRows).toHaveLength(targetCount);
    expect(sameOccurrenceRows).toHaveLength(DUMMY_POOL_SIZE - targetCount);
    expect(fallbackRows).toEqual([]);
  });

  test("tops up from other occurrences only for the remaining deficit", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "補完テスト帳");
    const other = await createOccurrenceRow(user.id, "別帳", 1);
    const targetCount = 10;
    const sameOccCount = 30;
    await Promise.all(
      Array.from({ length: targetCount }, (_, i) =>
        createQuizWordRow(user.id, `target${i}`, {
          occurrence: { id: occurrence.id, occurrenceNumber: i + 1 },
        }),
      ),
    );
    // 同一 Occurrence の範囲外は不足分に満たない数だけ
    await Promise.all(
      Array.from({ length: sameOccCount }, (_, i) =>
        createQuizWordRow(user.id, `sameocc${i}`, {
          occurrence: { id: occurrence.id, occurrenceNumber: 1000 + i },
        }),
      ),
    );
    // 他 Occurrence を潤沢に投入
    await Promise.all(
      Array.from({ length: DUMMY_POOL_SIZE }, (_, i) =>
        createQuizWordRow(user.id, `other${i}`, {
          occurrence: { id: other.id, occurrenceNumber: i + 1 },
        }),
      ),
    );

    const { targetRows, sameOccurrenceRows, fallbackRows } = await fetchQuizSource(
      user.id,
      occurrence.id,
      { from: 1, to: 50 },
    );
    expect(targetRows).toHaveLength(targetCount);
    expect(sameOccurrenceRows).toHaveLength(sameOccCount);
    expect(fallbackRows).toHaveLength(DUMMY_POOL_SIZE - targetCount - sameOccCount);
  });

  test("fetches no dummy pools when in-range targets already reach DUMMY_POOL_SIZE", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "充足テスト帳");
    await Promise.all(
      Array.from({ length: DUMMY_POOL_SIZE }, (_, i) =>
        createQuizWordRow(user.id, `target${i}`, {
          occurrence: { id: occurrence.id, occurrenceNumber: i + 1 },
        }),
      ),
    );
    // 本来ならダミープールに入る単語を置いても取得されないはず
    await createQuizWordRow(user.id, "outofrange", {
      occurrence: { id: occurrence.id, occurrenceNumber: 9999 },
    });
    await createQuizWordRow(user.id, "other");

    const { targetRows, sameOccurrenceRows, fallbackRows } = await fetchQuizSource(
      user.id,
      occurrence.id,
      { from: 1, to: DUMMY_POOL_SIZE },
    );
    expect(targetRows).toHaveLength(DUMMY_POOL_SIZE);
    expect(sameOccurrenceRows).toEqual([]);
    expect(fallbackRows).toEqual([]);
  });

  test("throws OccurrenceNotFoundError for an unknown or foreign occurrence", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const strangerOccurrence = await createOccurrenceRow(stranger.id, "他人の出典");

    await expect(fetchQuizSource(user.id, "nonexistent-id", {})).rejects.toThrow(
      OccurrenceNotFoundError,
    );
    await expect(fetchQuizSource(user.id, strangerOccurrence.id, {})).rejects.toThrow(
      OccurrenceNotFoundError,
    );
  });
});

describe("countQuizSourceExclusions", () => {
  test("counts no-number and no-meaning words within the occurrence", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "除外テスト帳");
    // 出題対象（番号あり・意味あり）: どちらにも数えられない
    await createQuizWordRow(user.id, "ok", {
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
    });
    // 番号なし（意味あり）
    await createQuizWordRow(user.id, "nonum1", {
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });
    await createQuizWordRow(user.id, "nonum2", {
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });
    // 意味なし（番号あり）
    await createQuizWordRow(user.id, "nomeaning", {
      meanings: [],
      occurrence: { id: occurrence.id, occurrenceNumber: 2 },
    });
    // MeaningText 0 件も意味なしに数える
    await createQuizWordRow(user.id, "emptytexts", {
      meanings: [{ texts: [] }],
      occurrence: { id: occurrence.id, occurrenceNumber: 3 },
    });

    const counts = await countQuizSourceExclusions(user.id, occurrence.id);
    expect(counts).toEqual({ noNumber: 2, noMeaning: 2 });
  });

  test("counts a word lacking both number and meaning in both buckets", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "両方欠落テスト帳");
    await createQuizWordRow(user.id, "both", {
      meanings: [],
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });

    const counts = await countQuizSourceExclusions(user.id, occurrence.id);
    expect(counts).toEqual({ noNumber: 1, noMeaning: 1 });
  });

  test("does not count foreign users' words, and counts words outside the occurrence in neither bucket", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const occurrence = await getSystemOccurrence(SYSTEM_OCCURRENCE_LOCATIONS[0]);
    // 他ユーザーの番号なし・意味なし単語（同じ system Occurrence に紐付け）
    await createQuizWordRow(stranger.id, "foreign", {
      meanings: [],
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });
    // 対象 Occurrence に紐付かない番号なし相当・意味なし単語
    await createQuizWordRow(user.id, "unlinked", { meanings: [] });

    const counts = await countQuizSourceExclusions(user.id, occurrence.id);
    expect(counts).toEqual({ noNumber: 0, noMeaning: 0 });
  });
});

describe("countQuizTargets", () => {
  test("counts numbered+meaning words and respects range bounds (both / one-sided / none)", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "対象件数テスト帳");
    for (const n of [1, 3, 5, 7]) {
      await createQuizWordRow(user.id, `w${n}`, {
        occurrence: { id: occurrence.id, occurrenceNumber: n },
      });
    }

    // 範囲なし: 番号あり・意味ありの 4 件
    expect(await countQuizTargets(user.id, occurrence.id, {})).toBe(4);
    // 両側指定 [3, 5]: 3, 5 の 2 件
    expect(await countQuizTargets(user.id, occurrence.id, { from: 3, to: 5 })).toBe(2);
    // from のみ: >= 5 の 5, 7 の 2 件
    expect(await countQuizTargets(user.id, occurrence.id, { from: 5 })).toBe(2);
    // to のみ: <= 3 の 1, 3 の 2 件
    expect(await countQuizTargets(user.id, occurrence.id, { to: 3 })).toBe(2);
  });

  test("excludes no-number, no-meaning, and out-of-occurrence words", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "対象除外テスト帳");
    const other = await createOccurrenceRow(user.id, "別帳", 1);
    // 対象（番号あり・意味あり）
    await createQuizWordRow(user.id, "ok", {
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
    });
    // 番号なし → 対象外
    await createQuizWordRow(user.id, "nonum", {
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });
    // 意味なし（番号あり）→ 対象外
    await createQuizWordRow(user.id, "nomeaning", {
      meanings: [],
      occurrence: { id: occurrence.id, occurrenceNumber: 2 },
    });
    // 別 Occurrence の単語 → 対象外
    await createQuizWordRow(user.id, "elsewhere", {
      occurrence: { id: other.id, occurrenceNumber: 1 },
    });

    expect(await countQuizTargets(user.id, occurrence.id, {})).toBe(1);
  });

  test("does not count a foreign user's words", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const occurrence = await getSystemOccurrence(SYSTEM_OCCURRENCE_LOCATIONS[0]);
    await createQuizWordRow(stranger.id, "foreign", {
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
    });
    await createQuizWordRow(user.id, "own", {
      occurrence: { id: occurrence.id, occurrenceNumber: 2 },
    });

    expect(await countQuizTargets(user.id, occurrence.id, {})).toBe(1);
  });
});
