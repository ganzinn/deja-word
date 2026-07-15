import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  DefaultOccurrenceNotInScopeError,
  getQuizDefaultsForUser,
  saveQuizDefaultsForUser,
  saveStartSettingsAsDefaultsForUser,
  type QuizDefaults,
} from "@/lib/quiz-default-settings";
import { DEFAULT_QUIZ_SETTINGS } from "@/lib/quiz/default-settings";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import type { QuizFormat } from "@/generated/prisma/enums";

import { createOccurrenceRow, createTestUser } from "../../tests/setup/fixtures";

/** 指定形式だけ秒数を入れ、残りは null（制限なし）にした全形式キーの map。 */
function timeoutMap(
  partial: Partial<Record<QuizFormat, number>>,
): Record<QuizFormat, number | null> {
  return {
    CHOICE: partial.CHOICE ?? null,
    SELF_JUDGE: partial.SELF_JUDGE ?? null,
    MULTI_MEANING: partial.MULTI_MEANING ?? null,
    CHOICE_JA_EN: partial.CHOICE_JA_EN ?? null,
    SELF_JUDGE_JA_EN: partial.SELF_JUDGE_JA_EN ?? null,
    SPELLING: partial.SPELLING ?? null,
    CHOICE_TG: partial.CHOICE_TG ?? null,
    CHOICE_TG_JA_EN: partial.CHOICE_TG_JA_EN ?? null,
    SELF_JUDGE_TG: partial.SELF_JUDGE_TG ?? null,
    SELF_JUDGE_TG_JA_EN: partial.SELF_JUDGE_TG_JA_EN ?? null,
  };
}

/** 全項目未設定（null）を既定とし、override で必要な項目だけ差し替えた QuizDefaults。 */
function defaults(overrides: Partial<QuizDefaults> = {}): QuizDefaults {
  return {
    occurrenceId: null,
    rangeFrom: null,
    rangeTo: null,
    bookmarkedOnly: null,
    format: null,
    timeoutByFormat: timeoutMap({}),
    showCountdown: null,
    autoplayPronunciation: null,
    enableAnswerSound: null,
    autoplayAnswerAudioJaEn: null,
    choiceFirstMeaningTextOnly: null,
    drillIncludeCorrect: null,
    resetRemaining: null,
    vagueRemaining: null,
    initialCorrectRemaining: null,
    saveOnStart: null,
    ...overrides,
  };
}

describe("saveQuizDefaultsForUser", () => {
  test("creates one row and re-save updates it in place", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "自前 location", 0);

    await saveQuizDefaultsForUser(
      user.id,
      defaults({
        occurrenceId: occ.id,
        rangeFrom: 1,
        rangeTo: 100,
        format: "CHOICE",
        timeoutByFormat: timeoutMap({ CHOICE: 5, SELF_JUDGE: 20 }),
        showCountdown: true,
        autoplayPronunciation: true,
        enableAnswerSound: true,
        autoplayAnswerAudioJaEn: true,
      }),
    );
    await saveQuizDefaultsForUser(
      user.id,
      defaults({
        occurrenceId: occ.id,
        rangeFrom: null,
        rangeTo: 50,
        format: "SELF_JUDGE",
        timeoutByFormat: timeoutMap({ SELF_JUDGE: 30 }),
        showCountdown: false,
        autoplayPronunciation: false,
        enableAnswerSound: false,
        autoplayAnswerAudioJaEn: false,
      }),
    );

    const rows = await prisma.quizDefaultSetting.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      occurrenceId: occ.id,
      rangeFrom: null,
      rangeTo: 50,
      format: "SELF_JUDGE",
      showCountdown: false,
      autoplayPronunciation: false,
      enableAnswerSound: false,
      autoplayAnswerAudioJaEn: false,
    });
  });

  test("persists autoplayPronunciation, enableAnswerSound and autoplayAnswerAudioJaEn independently", async () => {
    const user = await createTestUser();
    // 発音の自動再生は OFF、正誤の効果音は ON、解答表示時の発音は OFF という独立した組み合わせを保存する
    await saveQuizDefaultsForUser(
      user.id,
      defaults({
        autoplayPronunciation: false,
        enableAnswerSound: true,
        autoplayAnswerAudioJaEn: false,
      }),
    );
    const saved = await getQuizDefaultsForUser(user.id);
    expect(saved?.autoplayPronunciation).toBe(false);
    expect(saved?.enableAnswerSound).toBe(true);
    expect(saved?.autoplayAnswerAudioJaEn).toBe(false);
  });

  test("persists saveOnStart and defaults missing rows to null", async () => {
    const user = await createTestUser();
    await saveQuizDefaultsForUser(user.id, defaults({ saveOnStart: true }));
    expect((await getQuizDefaultsForUser(user.id))?.saveOnStart).toBe(true);
  });

  test("persists drillIncludeCorrect (round-trips true)", async () => {
    const user = await createTestUser();
    await saveQuizDefaultsForUser(user.id, defaults({ drillIncludeCorrect: true }));
    expect((await getQuizDefaultsForUser(user.id))?.drillIncludeCorrect).toBe(true);
  });

  test("persists bookmarkedOnly (round-trips true) and retains it after occurrence SetNull (決定 6)", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "削除予定bm", 0);
    await saveQuizDefaultsForUser(
      user.id,
      defaults({ occurrenceId: occ.id, bookmarkedOnly: true }),
    );
    expect((await getQuizDefaultsForUser(user.id))?.bookmarkedOnly).toBe(true);

    // occurrence 削除（DB の SetNull）で occurrenceId は null になるが bookmarkedOnly は残る
    // （結果の「occurrenceId null ＋ bookmarkedOnly true」は全件モードの初期値として成立する）。
    await prisma.occurrence.delete({ where: { id: occ.id } });
    const saved = await getQuizDefaultsForUser(user.id);
    expect(saved?.occurrenceId).toBeNull();
    expect(saved?.bookmarkedOnly).toBe(true);
  });

  test("syncs per-format timeout rows: upsert for values, delete for null on re-save", async () => {
    const user = await createTestUser();

    await saveQuizDefaultsForUser(
      user.id,
      defaults({ timeoutByFormat: timeoutMap({ CHOICE: 5, SELF_JUDGE: 20, MULTI_MEANING: 30 }) }),
    );
    expect(await prisma.quizDefaultTimeout.count({ where: { userId: user.id } })).toBe(3);

    // CHOICE は値変更、SELF_JUDGE は据え置き、MULTI_MEANING は null 化（行削除）
    await saveQuizDefaultsForUser(
      user.id,
      defaults({ timeoutByFormat: timeoutMap({ CHOICE: 10, SELF_JUDGE: 20 }) }),
    );

    const saved = await getQuizDefaultsForUser(user.id);
    expect(saved?.timeoutByFormat).toEqual(timeoutMap({ CHOICE: 10, SELF_JUDGE: 20 }));
    expect(
      await prisma.quizDefaultTimeout.findUnique({
        where: { userId_format: { userId: user.id, format: "MULTI_MEANING" } },
      }),
    ).toBeNull();
  });

  test("accepts all-null defaults", async () => {
    const user = await createTestUser();
    await saveQuizDefaultsForUser(user.id, defaults());
    expect(await getQuizDefaultsForUser(user.id)).toEqual(defaults());
    // QuizDefaultSetting 行は作られるが timeout 行はゼロ
    expect(await prisma.quizDefaultTimeout.count({ where: { userId: user.id } })).toBe(0);
  });

  test("throws when occurrence is outside scopedOwnerIds(userId)", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const bOcc = await createOccurrenceRow(b.id, "B's", 0);
    await expect(
      saveQuizDefaultsForUser(a.id, defaults({ occurrenceId: bOcc.id })),
    ).rejects.toBeInstanceOf(DefaultOccurrenceNotInScopeError);
  });

  test("accepts a system-owned occurrence", async () => {
    const user = await createTestUser();
    const sysOcc = await createOccurrenceRow(SYSTEM_USER_ID, "system 追加分", 100);
    await saveQuizDefaultsForUser(user.id, defaults({ occurrenceId: sysOcc.id }));
    const saved = await getQuizDefaultsForUser(user.id);
    expect(saved?.occurrenceId).toBe(sysOcc.id);
  });
});

describe("getQuizDefaultsForUser", () => {
  test("returns null when nothing is saved", async () => {
    const user = await createTestUser();
    expect(await getQuizDefaultsForUser(user.id)).toBeNull();
  });

  test("returns saved values with full per-format timeout map", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "自前 location", 0);
    await saveQuizDefaultsForUser(
      user.id,
      defaults({
        occurrenceId: occ.id,
        rangeFrom: 10,
        rangeTo: 20,
        format: "MULTI_MEANING",
        timeoutByFormat: timeoutMap({ MULTI_MEANING: 30 }),
        showCountdown: false,
        autoplayPronunciation: false,
        enableAnswerSound: false,
        autoplayAnswerAudioJaEn: false,
      }),
    );
    expect(await getQuizDefaultsForUser(user.id)).toEqual(
      defaults({
        occurrenceId: occ.id,
        rangeFrom: 10,
        rangeTo: 20,
        format: "MULTI_MEANING",
        timeoutByFormat: timeoutMap({ MULTI_MEANING: 30 }),
        showCountdown: false,
        autoplayPronunciation: false,
        enableAnswerSound: false,
        autoplayAnswerAudioJaEn: false,
      }),
    );
  });

  test("returns non-null when only per-format timeout is set (no QuizDefaultSetting row)", async () => {
    const user = await createTestUser();
    // QuizDefaultSetting を作らず timeout 行だけ直接挿入
    await prisma.quizDefaultTimeout.create({
      data: { userId: user.id, format: "CHOICE", timeoutSeconds: 7 },
    });
    expect(await getQuizDefaultsForUser(user.id)).toEqual(
      defaults({ timeoutByFormat: timeoutMap({ CHOICE: 7 }) }),
    );
  });

  test("occurrence deletion clears only occurrenceId and does not touch per-format timeouts", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "削除予定", 0);
    await saveQuizDefaultsForUser(
      user.id,
      defaults({
        occurrenceId: occ.id,
        rangeFrom: 1,
        rangeTo: 30,
        format: "CHOICE",
        timeoutByFormat: timeoutMap({ CHOICE: 5 }),
        showCountdown: false,
        autoplayPronunciation: false,
        enableAnswerSound: false,
        autoplayAnswerAudioJaEn: false,
      }),
    );

    await prisma.occurrence.delete({ where: { id: occ.id } });

    expect(await getQuizDefaultsForUser(user.id)).toEqual(
      defaults({
        occurrenceId: null,
        rangeFrom: 1,
        rangeTo: 30,
        format: "CHOICE",
        timeoutByFormat: timeoutMap({ CHOICE: 5 }),
        showCountdown: false,
        autoplayPronunciation: false,
        enableAnswerSound: false,
        autoplayAnswerAudioJaEn: false,
      }),
    );
  });
});

describe("saveStartSettingsAsDefaultsForUser", () => {
  test("overwrites only start-screen items and preserves behavior settings and other formats' timeouts", async () => {
    const user = await createTestUser();
    const occA = await createOccurrenceRow(user.id, "A", 0);
    const occB = await createOccurrenceRow(user.id, "B", 1);

    // 既存デフォルト: 挙動設定 ON/OFF＋複数形式の制限時間＋メタ設定を保存しておく
    await saveQuizDefaultsForUser(
      user.id,
      defaults({
        occurrenceId: occA.id,
        rangeFrom: 1,
        rangeTo: 10,
        format: "CHOICE",
        timeoutByFormat: timeoutMap({ CHOICE: 5, SELF_JUDGE: 20 }),
        showCountdown: true,
        autoplayPronunciation: false,
        enableAnswerSound: false,
        autoplayAnswerAudioJaEn: false,
        saveOnStart: true,
      }),
    );

    // 開始画面からの部分上書き: occurrence/range/format・選択中形式（SELF_JUDGE）の制限時間・
    // 四択先頭訳語のみ表示のみ（null→true に上書きされることを確認）
    await saveStartSettingsAsDefaultsForUser(user.id, {
      occurrenceId: occB.id,
      rangeFrom: 3,
      rangeTo: 7,
      format: "SELF_JUDGE",
      timeoutSeconds: 30,
      choiceFirstMeaningTextOnly: true,
    });

    expect(await getQuizDefaultsForUser(user.id)).toEqual(
      defaults({
        occurrenceId: occB.id,
        rangeFrom: 3,
        rangeTo: 7,
        format: "SELF_JUDGE",
        // CHOICE の制限時間は温存、SELF_JUDGE は 20→30 に更新
        timeoutByFormat: timeoutMap({ CHOICE: 5, SELF_JUDGE: 30 }),
        // 開始画面項目（四択先頭訳語のみ表示）は上書きされる
        choiceFirstMeaningTextOnly: true,
        // bookmarkedOnly も開始画面項目。入力で未指定 = false へ上書きされる（決定 6）
        bookmarkedOnly: false,
        // 定着までの回数は開始画面に項目が無いため触らない（null のまま温存）
        // 挙動設定・メタ設定はすべて温存
        showCountdown: true,
        autoplayPronunciation: false,
        enableAnswerSound: false,
        autoplayAnswerAudioJaEn: false,
        saveOnStart: true,
      }),
    );
  });

  test("first save establishes recommended defaults for all formats, with the selected format overridden", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "新規", 0);

    await saveStartSettingsAsDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: undefined,
      rangeTo: undefined,
      format: "CHOICE",
      timeoutSeconds: 8,
      choiceFirstMeaningTextOnly: true,
    });

    // 初回保存なので推奨デフォルトの全形式制限時間が確立され、選択中の CHOICE のみ 8 に上書き。
    // これにより未選択形式（SELF_JUDGE など）の推奨制限時間が「制限なし」に化けない。
    expect(await getQuizDefaultsForUser(user.id)).toEqual(
      defaults({
        occurrenceId: occ.id,
        format: "CHOICE",
        timeoutByFormat: { ...DEFAULT_QUIZ_SETTINGS.timeoutByFormat, CHOICE: 8 },
        choiceFirstMeaningTextOnly: true,
        // bookmarkedOnly も開始画面項目。入力で未指定 = false（決定 6）
        bookmarkedOnly: false,
      }),
    );
  });

  test("first save disabling the selected format's timeout still establishes other formats' recommended defaults", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "新規2", 0);

    // 選択中形式（CHOICE）の制限時間を無効化（null）して初回保存しても、
    // 未選択形式の推奨デフォルトは確立される。
    await saveStartSettingsAsDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: undefined,
      rangeTo: undefined,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: true,
    });

    expect((await getQuizDefaultsForUser(user.id))?.timeoutByFormat).toEqual({
      ...DEFAULT_QUIZ_SETTINGS.timeoutByFormat,
      CHOICE: null,
    });
  });

  test("timeoutSeconds null deletes only the selected format's timeout row", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "C", 0);
    await saveQuizDefaultsForUser(
      user.id,
      defaults({
        occurrenceId: occ.id,
        format: "CHOICE",
        timeoutByFormat: timeoutMap({ CHOICE: 5, SELF_JUDGE: 20 }),
      }),
    );

    await saveStartSettingsAsDefaultsForUser(user.id, {
      occurrenceId: occ.id,
      rangeFrom: undefined,
      rangeTo: undefined,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    });

    const saved = await getQuizDefaultsForUser(user.id);
    // CHOICE は行削除（制限なし）、SELF_JUDGE は温存
    expect(saved?.timeoutByFormat).toEqual(timeoutMap({ SELF_JUDGE: 20 }));
  });

  test("throws when occurrence is outside scopedOwnerIds(userId)", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const bOcc = await createOccurrenceRow(b.id, "B's", 0);
    await expect(
      saveStartSettingsAsDefaultsForUser(a.id, {
        occurrenceId: bOcc.id,
        rangeFrom: undefined,
        rangeTo: undefined,
        format: "CHOICE",
        timeoutSeconds: null,
        choiceFirstMeaningTextOnly: false,
      }),
    ).rejects.toBeInstanceOf(DefaultOccurrenceNotInScopeError);
  });

  test("all-bookmark mode (no occurrence) stores bookmarkedOnly with a null occurrence (決定 6)", async () => {
    const user = await createTestUser();
    // 掲載箇所なし（全件モードの元テスト由来）: occurrenceId / range とも未指定、bookmarkedOnly true。
    await saveStartSettingsAsDefaultsForUser(user.id, {
      bookmarkedOnly: true,
      format: "CHOICE",
      timeoutSeconds: null,
      choiceFirstMeaningTextOnly: false,
    });
    const saved = await getQuizDefaultsForUser(user.id);
    expect(saved?.occurrenceId).toBeNull();
    expect(saved?.bookmarkedOnly).toBe(true);
  });
});
