import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  OccurrenceNotFoundError,
  type RelatedImportRow,
  importRelatedWords,
} from "@/lib/related-word-import";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createOccurrenceRow, createQuizWordRow } from "../../tests/setup/fixtures";

const LOCATION = "関連語テスト";

/** 掲載番号 1/2/3 の 3 語を持つ掲載箇所を用意する。 */
async function seedOccurrenceWithWords() {
  const occ = await createOccurrenceRow(SYSTEM_USER_ID, LOCATION, 9);
  const make = (headword: string, n: number) =>
    createQuizWordRow(SYSTEM_USER_ID, headword, {
      occurrence: { id: occ.id, occurrenceNumber: n },
    });
  const alpha = await make("alpha", 1);
  const beta = await make("beta", 2);
  const gamma = await make("gamma", 3);
  return { occ, alpha, beta, gamma };
}

describe("importRelatedWords", () => {
  test("前方/後方リンクを掲載番号で解決し、未解決・word 未検出を報告する", async () => {
    const { occ, alpha, gamma } = await seedOccurrenceWithWords();

    const rows: RelatedImportRow[] = [
      { headword: "alpha", kind: "SYNONYM", term: "gamma-syn", meaning: null, linkNumber: 3 }, // 前方
      { headword: "gamma", kind: "ANTONYM", term: "alpha-ant", meaning: "アルファ", linkNumber: 1 }, // 後方
      { headword: "beta", kind: "SYNONYM", term: "no-link", meaning: null, linkNumber: null }, // リンクなし
      { headword: "beta", kind: "ANTONYM", term: "oob", meaning: null, linkNumber: 99 }, // 範囲外
      { headword: "missing", kind: "SYNONYM", term: "orphan", meaning: null, linkNumber: null }, // 親なし
    ];

    const report = await importRelatedWords(prisma, { location: LOCATION }, rows, {
      dryRun: false,
    });

    expect(report.occurrenceId).toBe(occ.id);
    expect(report.totalRows).toBe(5);
    expect(report.willCreate).toBe(4);
    expect(report.created).toBe(4);
    expect(report.linksResolved).toBe(2);
    expect(report.skipped).toEqual([
      { headword: "missing", term: "orphan", reason: "word_not_found" },
    ]);
    expect(report.unresolvedLinks).toEqual([
      { headword: "beta", term: "oob", linkNumber: 99, reason: "out_of_range" },
    ]);

    // alpha → gamma（前方リンク）
    const alphaRels = await prisma.relatedWord.findMany({
      where: { wordId: alpha.id },
      select: { kind: true, term: true, meaning: true, linkedWordId: true, sortOrder: true },
    });
    expect(alphaRels).toEqual([
      { kind: "SYNONYM", term: "gamma-syn", meaning: null, linkedWordId: gamma.id, sortOrder: 0 },
    ]);

    // gamma → alpha（後方リンク・訳あり）
    const gammaRels = await prisma.relatedWord.findMany({ where: { wordId: gamma.id } });
    expect(gammaRels).toHaveLength(1);
    expect(gammaRels[0]).toMatchObject({
      kind: "ANTONYM",
      term: "alpha-ant",
      meaning: "アルファ",
      linkedWordId: alpha.id,
    });

    // beta の 2 件は sortOrder 0,1、いずれも linkedWordId は null
    const beta = await prisma.word.findUniqueOrThrow({
      where: { ownerId_headword: { ownerId: SYSTEM_USER_ID, headword: "beta" } },
      select: { id: true },
    });
    const betaRels = await prisma.relatedWord.findMany({
      where: { wordId: beta.id },
      orderBy: { sortOrder: "asc" },
      select: { term: true, sortOrder: true, linkedWordId: true },
    });
    expect(betaRels).toEqual([
      { term: "no-link", sortOrder: 0, linkedWordId: null },
      { term: "oob", sortOrder: 1, linkedWordId: null },
    ]);
  });

  test("dry-run は一切書き込まない（リンク解決見込みは数える）", async () => {
    await seedOccurrenceWithWords();
    const rows: RelatedImportRow[] = [
      { headword: "alpha", kind: "SYNONYM", term: "g", meaning: null, linkNumber: 3 },
      { headword: "beta", kind: "SYNONYM", term: "n", meaning: null, linkNumber: null },
    ];

    const report = await importRelatedWords(prisma, { location: LOCATION }, rows, { dryRun: true });

    expect(report.executed).toBe(false);
    expect(report.willCreate).toBe(2);
    expect(report.created).toBe(0);
    expect(report.linksResolved).toBe(1);
    expect(await prisma.relatedWord.count()).toBe(0);
  });

  test("掲載箇所が無ければ OccurrenceNotFoundError", async () => {
    await expect(
      importRelatedWords(prisma, { location: "存在しない掲載箇所" }, [], { dryRun: true }),
    ).rejects.toBeInstanceOf(OccurrenceNotFoundError);
  });
});
