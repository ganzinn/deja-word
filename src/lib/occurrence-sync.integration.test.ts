import { describe, expect, test } from "vitest";

import {
  type OccurrenceExport,
  OccurrenceLocationConflictError,
  UnsupportedExportVersionError,
  exportOccurrence,
  syncOccurrence,
} from "@/lib/occurrence-sync";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createOccurrenceRow, createTestUser } from "../../tests/setup/fixtures";

/** 反映先に既にある掲載箇所（＝置き換えの検証に使う）。 */
const SOURCE_LOCATION = "取り込み元単語帳";
/** 反映先にまだ無い掲載箇所（＝新規作成の検証に使う）。 */
const NEW_LOCATION = "取り込み先単語帳";

/** エクスポート元に見立てた単語を 1 件作る（意味・例文・関連語・メモ・掲載番号詳細つき）。 */
async function seedRichWord(
  occurrenceId: string,
  ownerId: string,
  occurrenceNumber: number,
  headword: string,
  options: { linkedWordId?: string; audioUrl?: string } = {},
) {
  const word = await prisma.word.create({
    data: {
      ownerId,
      headword,
      meanings: {
        create: [
          {
            ownerId,
            partOfSpeech: "verb",
            pronunciation: "prəˈnaʊns",
            sortOrder: 0,
            pronunciationAudioUrl: options.audioUrl ?? null,
            texts: { create: [{ ownerId, text: `${headword}の訳1`, sortOrder: 0 }] },
            notes: { create: [{ ownerId, text: `${headword}の意味ノート`, sortOrder: 0 }] },
          },
          {
            ownerId,
            partOfSpeech: "noun",
            sortOrder: 1,
            texts: { create: [{ ownerId, text: `${headword}の訳2`, sortOrder: 0 }] },
          },
        ],
      },
      examples: {
        create: [
          {
            ownerId,
            kind: "TARGET",
            text: `${headword} example`,
            meaning: `${headword} の例文訳`,
            sortOrder: 0,
            notes: { create: [{ ownerId, text: "例文ノート", sortOrder: 0 }] },
          },
        ],
      },
      relatedWords: {
        create: [
          {
            ownerId,
            kind: "SYNONYM",
            term: `${headword}-syn`,
            sortOrder: 0,
            linkedWordId: options.linkedWordId ?? null,
            notes: { create: [{ ownerId, text: "関連語ノート", sortOrder: 0 }] },
          },
        ],
      },
      memos: { create: [{ ownerId, text: `${headword}のメモ`, sortOrder: 0 }] },
    },
    select: { id: true },
  });
  await prisma.wordOccurrence.create({
    data: {
      wordId: word.id,
      occurrenceId,
      ownerId,
      occurrenceNumber,
      sortOrder: 0,
      details: { create: [{ ownerId, detail: `No.${occurrenceNumber} の掲載メモ`, sortOrder: 0 }] },
    },
  });
  return word;
}

/** 反映のテスト入力に使う最小の中間 JSON。 */
function makeExport(
  entries: OccurrenceExport["entries"],
  overrides: Partial<OccurrenceExport> = {},
): OccurrenceExport {
  return {
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    occurrence: {
      location: NEW_LOCATION,
      autoNumbering: true,
      owner: { name: "共通", email: "system@deja-word.internal", isSystem: true },
    },
    entries,
    ...overrides,
  };
}

function makeEntry(
  occurrenceNumber: number,
  headword: string,
  overrides: Partial<OccurrenceExport["entries"][number]> = {},
): OccurrenceExport["entries"][number] {
  return {
    occurrenceNumber,
    headword,
    createdAt: "2026-01-01T00:00:00.000Z",
    sortOrder: 0,
    details: [],
    meanings: [
      {
        partOfSpeech: "noun",
        pronunciation: null,
        sortOrder: 0,
        pronunciationAudioUrl: "https://example.public.blob.vercel-storage.com/audio/x.mp3",
        texts: [{ text: `${headword}の新しい訳`, sortOrder: 0 }],
        notes: [],
      },
    ],
    examples: [],
    related: [],
    memos: [],
    ...overrides,
  };
}

describe("exportOccurrence", () => {
  test("掲載番号順に、注記・掲載番号詳細・関連語のリンク先見出し語まで書き出す", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    const linked = await seedRichWord(occ.id, SYSTEM_USER_ID, 1, "alpha");
    await seedRichWord(occ.id, SYSTEM_USER_ID, 2, "beta", { linkedWordId: linked.id });

    const report = await exportOccurrence(prisma, { occurrenceId: occ.id });

    expect(report.data.version).toBe(1);
    expect(report.data.occurrence.location).toBe(SOURCE_LOCATION);
    expect(report.data.occurrence.owner.isSystem).toBe(true);
    expect(report.data.entries.map((e) => e.occurrenceNumber)).toEqual([1, 2]);

    const beta = report.data.entries[1]!;
    expect(beta.headword).toBe("beta");
    expect(beta.meanings).toHaveLength(2);
    expect(beta.meanings[0]!.texts).toEqual([{ text: "betaの訳1", sortOrder: 0 }]);
    expect(beta.meanings[0]!.notes).toEqual([{ text: "betaの意味ノート", sortOrder: 0 }]);
    expect(beta.examples[0]!.notes).toEqual([{ text: "例文ノート", sortOrder: 0 }]);
    expect(beta.related[0]!.notes).toEqual([{ text: "関連語ノート", sortOrder: 0 }]);
    // 内部リンクは id ではなく見出し語で持つ（DB をまたぐと id が一致しないため）。
    expect(beta.related[0]!.linkedHeadword).toBe("alpha");
    expect(beta.memos).toEqual([{ text: "betaのメモ", sortOrder: 0 }]);
    expect(beta.details).toEqual([{ detail: "No.2 の掲載メモ", sortOrder: 0 }]);
  });

  test("numbers で絞り込み、指定したのに無い掲載番号を missingNumbers に返す", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    await seedRichWord(occ.id, SYSTEM_USER_ID, 1, "alpha");
    await seedRichWord(occ.id, SYSTEM_USER_ID, 3, "gamma");

    const report = await exportOccurrence(prisma, { occurrenceId: occ.id, numbers: [1, 2, 3] });

    expect(report.data.entries.map((e) => e.occurrenceNumber)).toEqual([1, 3]);
    expect(report.missingNumbers).toEqual([2]);
    expect(report.requestedCount).toBe(3);
  });

  test("掲載番号が無い単語は対象外にして件数だけ報告する", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    await seedRichWord(occ.id, SYSTEM_USER_ID, 1, "alpha");
    const noNumber = await prisma.word.create({
      data: { ownerId: SYSTEM_USER_ID, headword: "numberless" },
      select: { id: true },
    });
    await prisma.wordOccurrence.create({
      data: {
        wordId: noNumber.id,
        occurrenceId: occ.id,
        ownerId: SYSTEM_USER_ID,
        occurrenceNumber: null,
      },
    });

    const report = await exportOccurrence(prisma, { occurrenceId: occ.id });

    expect(report.data.entries.map((e) => e.headword)).toEqual(["alpha"]);
    expect(report.totalLinks).toBe(2);
    expect(report.withoutNumber).toBe(1);
  });
});

describe("syncOccurrence", () => {
  test("既存単語の中身を丸ごと置き換える（本文が JSON の内容になり、古い行は残らない）", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    const word = await seedRichWord(occ.id, SYSTEM_USER_ID, 1, "alpha");

    const report = await syncOccurrence(
      prisma,
      makeExport([makeEntry(1, "alpha")]),
      { ownerId: SYSTEM_USER_ID, location: SOURCE_LOCATION },
      { dryRun: false },
    );

    expect(report.executed).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]!.action).toBe("replaced");
    expect(report.results[0]!.before).toEqual({
      meanings: 2,
      examples: 1,
      related: 1,
      memos: 1,
    });
    expect(report.results[0]!.after).toEqual({ meanings: 1, examples: 0, related: 0, memos: 0 });

    const meanings = await prisma.meaning.findMany({
      where: { wordId: word.id },
      include: { texts: true },
    });
    expect(meanings).toHaveLength(1);
    expect(meanings[0]!.texts.map((t) => t.text)).toEqual(["alphaの新しい訳"]);
    // 置き換えなので、JSON に無い例文・関連語・メモは残らない。
    expect(await prisma.example.count({ where: { wordId: word.id } })).toBe(0);
    expect(await prisma.relatedWord.count({ where: { wordId: word.id } })).toBe(0);
    expect(await prisma.memo.count({ where: { wordId: word.id } })).toBe(0);
  });

  test("反映先の発音音源 URL は退避して付け直す（JSON 側の URL は使わない）", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    const word = await seedRichWord(occ.id, SYSTEM_USER_ID, 1, "alpha", {
      audioUrl: "/api/dev-blob/audio/meaning/local/pronunciation.mp3",
    });

    const report = await syncOccurrence(
      prisma,
      makeExport([makeEntry(1, "alpha")]),
      { ownerId: SYSTEM_USER_ID, location: SOURCE_LOCATION },
      { dryRun: false },
    );

    expect(report.results[0]!.keptAudio).toBe(1);
    const meaning = await prisma.meaning.findFirstOrThrow({
      where: { wordId: word.id, sortOrder: 0 },
      select: { pronunciationAudioUrl: true },
    });
    expect(meaning.pronunciationAudioUrl).toBe(
      "/api/dev-blob/audio/meaning/local/pronunciation.mp3",
    );
  });

  test("単語本体・掲載番号・ブックマーク・解答履歴には触れない", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    const user = await createTestUser();
    const word = await seedRichWord(occ.id, SYSTEM_USER_ID, 1, "alpha");
    await prisma.bookmark.create({ data: { userId: user.id, wordId: word.id } });
    await prisma.quizAnswer.create({
      data: {
        ownerId: user.id,
        wordId: word.id,
        mode: "TEST",
        format: "CHOICE",
        result: "CORRECT",
      },
    });

    await syncOccurrence(
      prisma,
      makeExport([makeEntry(1, "alpha")]),
      { ownerId: SYSTEM_USER_ID, location: SOURCE_LOCATION },
      { dryRun: false },
    );

    expect(await prisma.word.count({ where: { id: word.id } })).toBe(1);
    expect(await prisma.bookmark.count({ where: { wordId: word.id } })).toBe(1);
    expect(await prisma.quizAnswer.count({ where: { wordId: word.id } })).toBe(1);
    const link = await prisma.wordOccurrence.findFirstOrThrow({ where: { wordId: word.id } });
    expect(link.occurrenceNumber).toBe(1);
  });

  test("掲載箇所も単語も無ければ作る（掲載箇所ごと丸ごと取り込める）", async () => {
    const report = await syncOccurrence(
      prisma,
      makeExport([makeEntry(1, "alpha"), makeEntry(2, "beta")]),
      { ownerId: SYSTEM_USER_ID, location: NEW_LOCATION },
      { dryRun: false },
    );

    expect(report.target.occurrenceCreated).toBe(true);
    expect(report.results.map((r) => r.action)).toEqual(["created", "created"]);

    const created = await prisma.occurrence.findUniqueOrThrow({
      where: { ownerId_location: { ownerId: SYSTEM_USER_ID, location: NEW_LOCATION } },
      select: { id: true, autoNumbering: true },
    });
    expect(created.autoNumbering).toBe(true);
    // オーナー本人ぶんだけプリセットを ON にする（bulkImportWords と同じオプトイン方式）。
    const presets = await prisma.occurrencePresetSetting.findMany({
      where: { occurrenceId: created.id },
      select: { userId: true },
    });
    expect(presets.map((p) => p.userId)).toEqual([SYSTEM_USER_ID]);

    const links = await prisma.wordOccurrence.findMany({
      where: { occurrenceId: created.id },
      orderBy: { occurrenceNumber: "asc" },
      select: { occurrenceNumber: true, word: { select: { headword: true } } },
    });
    expect(links.map((l) => [l.occurrenceNumber, l.word.headword])).toEqual([
      [1, "alpha"],
      [2, "beta"],
    ]);
  });

  test("関連語の内部リンクは、同じ取り込みで後から作られる単語にも張られる（前方参照）", async () => {
    const report = await syncOccurrence(
      prisma,
      makeExport([
        // No.1 が、まだ作られていない No.2 の単語を参照する。
        makeEntry(1, "alpha", {
          related: [
            {
              kind: "SYNONYM",
              term: "beta",
              partOfSpeech: null,
              pronunciation: null,
              meaning: null,
              sortOrder: 0,
              linkedHeadword: "beta",
              pronunciationAudioUrl: null,
              notes: [],
            },
          ],
        }),
        makeEntry(2, "beta"),
      ]),
      { ownerId: SYSTEM_USER_ID, location: NEW_LOCATION },
      { dryRun: false },
    );

    expect(report.unresolvedLinks).toEqual([]);
    const related = await prisma.relatedWord.findFirstOrThrow({
      where: { term: "beta" },
      select: { linkedWord: { select: { headword: true } } },
    });
    expect(related.linkedWord?.headword).toBe("beta");
  });

  test("同じ掲載番号に別の見出し語があればスキップし、上書きしない", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    const word = await seedRichWord(occ.id, SYSTEM_USER_ID, 1, "alpha");

    const report = await syncOccurrence(
      prisma,
      makeExport([makeEntry(1, "different")]),
      { ownerId: SYSTEM_USER_ID, location: SOURCE_LOCATION },
      { dryRun: false },
    );

    expect(report.results).toHaveLength(0);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]!.reason).toBe("headword_mismatch");
    // 既存の中身は無傷。
    expect(await prisma.meaning.count({ where: { wordId: word.id } })).toBe(2);
  });

  test("同じ見出し語が同掲載箇所の別番号に紐づいていればスキップする", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    await seedRichWord(occ.id, SYSTEM_USER_ID, 5, "alpha");

    const report = await syncOccurrence(
      prisma,
      makeExport([makeEntry(1, "alpha")]),
      { ownerId: SYSTEM_USER_ID, location: SOURCE_LOCATION },
      { dryRun: false },
    );

    expect(report.skipped[0]!.reason).toBe("word_linked_to_other_number");
  });

  test("dry-run は何も書かず、実行時と同じ内訳を返す", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    const word = await seedRichWord(occ.id, SYSTEM_USER_ID, 1, "alpha", {
      audioUrl: "/api/dev-blob/audio/meaning/local/pronunciation.mp3",
    });

    const report = await syncOccurrence(
      prisma,
      makeExport([makeEntry(1, "alpha")]),
      { ownerId: SYSTEM_USER_ID, location: SOURCE_LOCATION },
      { dryRun: true },
    );

    expect(report.executed).toBe(false);
    expect(report.results[0]!.action).toBe("replaced");
    expect(report.results[0]!.keptAudio).toBe(1);
    // 無変更であること。
    expect(await prisma.meaning.count({ where: { wordId: word.id } })).toBe(2);
    expect(await prisma.example.count({ where: { wordId: word.id } })).toBe(1);
  });

  test("2 回実行しても同じ結果になる（冪等）", async () => {
    const input = makeExport([makeEntry(1, "alpha"), makeEntry(2, "beta")]);
    const target = { ownerId: SYSTEM_USER_ID, location: NEW_LOCATION };

    await syncOccurrence(prisma, input, target, { dryRun: false });
    const second = await syncOccurrence(prisma, input, target, { dryRun: false });

    expect(second.skipped).toEqual([]);
    expect(second.results.map((r) => r.action)).toEqual(["replaced", "replaced"]);
    const occurrence = await prisma.occurrence.findUniqueOrThrow({
      where: { ownerId_location: { ownerId: SYSTEM_USER_ID, location: NEW_LOCATION } },
      select: { id: true },
    });
    expect(await prisma.wordOccurrence.count({ where: { occurrenceId: occurrence.id } })).toBe(2);
    expect(await prisma.meaning.count({ where: { ownerId: SYSTEM_USER_ID } })).toBe(2);
  });

  test("エクスポート → 反映で往復し、元の内容が再現される", async () => {
    const source = await createOccurrenceRow(SYSTEM_USER_ID, SOURCE_LOCATION);
    const linked = await seedRichWord(source.id, SYSTEM_USER_ID, 1, "alpha");
    await seedRichWord(source.id, SYSTEM_USER_ID, 2, "beta", { linkedWordId: linked.id });
    const exported = await exportOccurrence(prisma, { occurrenceId: source.id });

    // 別ユーザーの掲載箇所を反映先にする（DB をまたいだ取り込みの代用）。
    const user = await createTestUser();
    const report = await syncOccurrence(
      prisma,
      exported.data,
      { ownerId: user.id, location: NEW_LOCATION },
      { dryRun: false },
    );

    expect(report.skipped).toEqual([]);
    expect(report.unresolvedLinks).toEqual([]);
    const beta = await prisma.word.findUniqueOrThrow({
      where: { ownerId_headword: { ownerId: user.id, headword: "beta" } },
      include: {
        meanings: { orderBy: { sortOrder: "asc" }, include: { texts: true, notes: true } },
        examples: { include: { notes: true } },
        relatedWords: { include: { notes: true, linkedWord: { select: { headword: true } } } },
        memos: true,
        wordOccurrences: { include: { details: true } },
      },
    });
    expect(beta.meanings).toHaveLength(2);
    expect(beta.meanings[0]!.texts.map((t) => t.text)).toEqual(["betaの訳1"]);
    expect(beta.meanings[0]!.notes.map((n) => n.text)).toEqual(["betaの意味ノート"]);
    expect(beta.examples[0]!.text).toBe("beta example");
    expect(beta.examples[0]!.notes.map((n) => n.text)).toEqual(["例文ノート"]);
    expect(beta.relatedWords[0]!.linkedWord?.headword).toBe("alpha");
    expect(beta.memos.map((m) => m.text)).toEqual(["betaのメモ"]);
    expect(beta.wordOccurrences[0]!.details.map((d) => d.detail)).toEqual(["No.2 の掲載メモ"]);
    // 発音音源は同期しないので、新規作成された行には付かない。
    expect(beta.meanings[0]!.pronunciationAudioUrl).toBeNull();
  });

  test("反映先に無い掲載箇所名が scoped に衝突していれば作らずエラーにする", async () => {
    const user = await createTestUser();
    // system が同名の掲載箇所を持っていると、一般ユーザーは同名を作れない（既存の掲載箇所ルール）。
    await createOccurrenceRow(SYSTEM_USER_ID, "衝突する名前");

    await expect(
      syncOccurrence(
        prisma,
        makeExport([makeEntry(1, "alpha")]),
        { ownerId: user.id, location: "衝突する名前" },
        { dryRun: true },
      ),
    ).rejects.toBeInstanceOf(OccurrenceLocationConflictError);
  });

  test("対応していない版の JSON は受け付けない", async () => {
    await expect(
      syncOccurrence(
        prisma,
        makeExport([], { version: 999 }),
        { ownerId: SYSTEM_USER_ID, location: NEW_LOCATION },
        { dryRun: true },
      ),
    ).rejects.toBeInstanceOf(UnsupportedExportVersionError);
  });
});
