import { describe, expect, test } from "vitest";

import { OccurrenceNotFoundError } from "@/lib/occurrences-update";
import { countQuizSourceExclusions, fetchQuizSource } from "@/lib/quiz/queries/quiz-source";
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

    const rows = await fetchQuizSource(user.id, occurrence.id);
    const ids = rows.map((r) => r.id);
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

    const rows = await fetchQuizSource(user.id, occurrence.id);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(withMeaning.id);
    expect(ids).not.toContain(noMeaning.id);
    expect(ids).not.toContain(emptyTexts.id);
  });

  test("returns occurrenceNumber null for a linked word without number, and empty wordOccurrences for an unlinked word", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "番号テスト帳");
    const other = await createOccurrenceRow(user.id, "別の出典", 1);
    const numbered = await createQuizWordRow(user.id, "numbered", {
      occurrence: { id: occurrence.id, occurrenceNumber: 7 },
    });
    const noNumber = await createQuizWordRow(user.id, "nonumber", {
      occurrence: { id: occurrence.id, occurrenceNumber: null },
    });
    const otherOccurrence = await createQuizWordRow(user.id, "elsewhere", {
      occurrence: { id: other.id, occurrenceNumber: 1 },
    });

    const rows = await fetchQuizSource(user.id, occurrence.id);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(numbered.id)!.wordOccurrences).toEqual([{ occurrenceNumber: 7 }]);
    expect(byId.get(noNumber.id)!.wordOccurrences).toEqual([{ occurrenceNumber: null }]);
    // 対象 Occurrence に紐付かない単語も全登録プール用に返るが、wordOccurrences は空
    expect(byId.get(otherOccurrence.id)!.wordOccurrences).toEqual([]);
  });

  test("returns meanings with texts ordered by sortOrder", async () => {
    const user = await createTestUser();
    const occurrence = await createOccurrenceRow(user.id, "意味テスト帳");
    const word = await createQuizWordRow(user.id, "delta", {
      meanings: [{ texts: ["第一の意味", "第二の意味"] }, { texts: ["別品詞の意味"] }],
      occurrence: { id: occurrence.id, occurrenceNumber: 1 },
    });

    const rows = await fetchQuizSource(user.id, occurrence.id);
    const row = rows.find((r) => r.id === word.id);
    expect(row).toBeDefined();
    expect(row!.headword).toBe("delta");
    expect(row!.meanings).toHaveLength(2);
    expect(row!.meanings[0].texts.map((t) => t.text)).toEqual(["第一の意味", "第二の意味"]);
    expect(row!.meanings[1].texts.map((t) => t.text)).toEqual(["別品詞の意味"]);
  });

  test("throws OccurrenceNotFoundError for an unknown or foreign occurrence", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const strangerOccurrence = await createOccurrenceRow(stranger.id, "他人の出典");

    await expect(fetchQuizSource(user.id, "nonexistent-id")).rejects.toThrow(
      OccurrenceNotFoundError,
    );
    await expect(fetchQuizSource(user.id, strangerOccurrence.id)).rejects.toThrow(
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
