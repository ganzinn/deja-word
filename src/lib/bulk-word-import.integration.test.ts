import { describe, expect, test } from "vitest";

import {
  type BulkImportRow,
  DuplicateOccurrenceLocationError,
  UserNotFoundByEmailError,
  bulkImportWords,
} from "@/lib/bulk-word-import";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createTestUser, createWordRow } from "../../tests/setup/fixtures";

const rows: BulkImportRow[] = [
  {
    headword: "ubiquitous",
    partOfSpeech: "adjective",
    meaningTexts: ["どこにでもある", "遍在する"],
  },
  { headword: "concise", partOfSpeech: "adjective", meaningTexts: ["簡潔な"] },
  { headword: "lucid", partOfSpeech: null, meaningTexts: ["明快な"] },
];

describe("bulkImportWords", () => {
  test("system 宛て: 掲載箇所が system 所有で作られ、全ユーザーにプリセット付与される", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const report = await bulkImportWords(prisma, { location: "見本単語帳" }, rows, {
      dryRun: false,
    });

    expect(report.isSystem).toBe(true);
    expect(report.ownerId).toBe(SYSTEM_USER_ID);
    expect(report.created).toBe(3);
    expect(report.skipped).toHaveLength(0);
    expect(report.occurrenceId).not.toBeNull();

    const occ = await prisma.occurrence.findUniqueOrThrow({
      where: { id: report.occurrenceId! },
      select: { ownerId: true, location: true, autoNumbering: true },
    });
    expect(occ).toMatchObject({
      ownerId: SYSTEM_USER_ID,
      location: "見本単語帳",
      autoNumbering: true,
    });

    // system + userA + userB の全員にプリセット設定が付く
    const presetUserIds = (
      await prisma.occurrencePresetSetting.findMany({
        where: { occurrenceId: report.occurrenceId! },
        select: { userId: true },
      })
    )
      .map((p) => p.userId)
      .sort();
    expect(presetUserIds).toEqual([SYSTEM_USER_ID, userA.id, userB.id].sort());
    expect(report.presetSettings).toBe(3);
  });

  test("単語・意味・MeaningText・掲載番号(1,2,3…)が登録順で作られる", async () => {
    const report = await bulkImportWords(prisma, { location: "採番テスト" }, rows, {
      dryRun: false,
    });

    const links = await prisma.wordOccurrence.findMany({
      where: { occurrenceId: report.occurrenceId! },
      orderBy: { occurrenceNumber: "asc" },
      select: { occurrenceNumber: true, ownerId: true, word: { select: { headword: true } } },
    });
    expect(links.map((l) => [l.word.headword, l.occurrenceNumber])).toEqual([
      ["ubiquitous", 1],
      ["concise", 2],
      ["lucid", 3],
    ]);
    expect(links.every((l) => l.ownerId === SYSTEM_USER_ID)).toBe(true);

    // ubiquitous は MeaningText が 2 件、partOfSpeech も保存される
    const word = await prisma.word.findUniqueOrThrow({
      where: { ownerId_headword: { ownerId: SYSTEM_USER_ID, headword: "ubiquitous" } },
      select: { meanings: { select: { partOfSpeech: true, texts: { select: { text: true } } } } },
    });
    expect(word.meanings).toHaveLength(1);
    expect(word.meanings[0]!.partOfSpeech).toBe("adjective");
    expect(word.meanings[0]!.texts.map((t) => t.text)).toEqual(["どこにでもある", "遍在する"]);
  });

  test("個人ユーザー宛て: 掲載箇所はそのユーザー所有、プリセットは本人のみ", async () => {
    const user = await createTestUser({ email: "owner@test.local" });
    await createTestUser(); // 別ユーザー（プリセット対象外であること）

    const report = await bulkImportWords(
      prisma,
      { email: "OWNER@test.local", location: "個人帳" },
      rows,
      { dryRun: false },
    );

    expect(report.isSystem).toBe(false);
    expect(report.ownerId).toBe(user.id);
    expect(report.presetSettings).toBe(1);

    const occ = await prisma.occurrence.findUniqueOrThrow({
      where: { id: report.occurrenceId! },
      select: { ownerId: true },
    });
    expect(occ.ownerId).toBe(user.id);

    const presets = await prisma.occurrencePresetSetting.findMany({
      where: { occurrenceId: report.occurrenceId! },
      select: { userId: true },
    });
    expect(presets.map((p) => p.userId)).toEqual([user.id]);

    const words = await prisma.word.findMany({ where: { ownerId: user.id }, select: { id: true } });
    expect(words).toHaveLength(3);
  });

  test("既存 headword・CSV 内重複・意味なしはスキップして続行する", async () => {
    await createWordRow(SYSTEM_USER_ID, "concise"); // system 既存語

    const withDupes: BulkImportRow[] = [
      ...rows, // ubiquitous, concise(既存), lucid
      { headword: "lucid", partOfSpeech: null, meaningTexts: ["重複行"] }, // CSV 内重複
      { headword: "empty", partOfSpeech: null, meaningTexts: [] }, // 意味なし
    ];

    const report = await bulkImportWords(prisma, { location: "スキップ検証" }, withDupes, {
      dryRun: false,
    });

    expect(report.created).toBe(2); // ubiquitous, lucid
    expect(report.skipped).toEqual(
      expect.arrayContaining([
        { headword: "concise", reason: "duplicate" },
        { headword: "lucid", reason: "duplicate_in_csv" },
        { headword: "empty", reason: "no_meaning" },
      ]),
    );
    expect(report.skipped).toHaveLength(3);
  });

  test("dry-run は一切書き込まない（掲載箇所も作らない）", async () => {
    const report = await bulkImportWords(prisma, { location: "ドライ" }, rows, { dryRun: true });

    expect(report.executed).toBe(false);
    expect(report.occurrenceId).toBeNull();
    expect(report.willCreate).toBe(3);
    expect(report.created).toBe(0);

    const occ = await prisma.occurrence.findFirst({ where: { location: "ドライ" } });
    expect(occ).toBeNull();
    const words = await prisma.word.count({
      where: { headword: { in: rows.map((r) => r.headword) } },
    });
    expect(words).toBe(0);
  });

  test("未知 email は UserNotFoundByEmailError", async () => {
    await expect(
      bulkImportWords(prisma, { email: "nobody@test.local", location: "x" }, rows, {
        dryRun: true,
      }),
    ).rejects.toBeInstanceOf(UserNotFoundByEmailError);
  });

  test("掲載箇所名の衝突は DuplicateOccurrenceLocationError", async () => {
    // system 既存掲載箇所（fixtures がシードする "ターゲット1900"）と同名
    await expect(
      bulkImportWords(prisma, { location: "ターゲット1900" }, rows, { dryRun: true }),
    ).rejects.toBeInstanceOf(DuplicateOccurrenceLocationError);
  });
});
