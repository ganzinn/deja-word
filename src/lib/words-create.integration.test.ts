import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import type { WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import {
  DuplicateHeadwordError,
  DuplicateOccurrenceNumberError,
  createWordForUser,
} from "@/lib/words-create";

import {
  createOccurrenceRow,
  createTestUser,
  createWordRow,
  getSystemOccurrence,
} from "../../tests/setup/fixtures";

function emptyForm(headword: string, overrides: Partial<WordFormValues> = {}): WordFormValues {
  return {
    headword,
    meanings: [
      {
        partOfSpeech: "",
        pronunciation: "",
        texts: [{ text: "意味" }],
        notes: [],
      },
    ],
    examples: [],
    relatedWords: [],
    memos: [],
    occurrences: [],
    ...overrides,
  };
}

describe("createWordForUser", () => {
  test("happy path: creates word with nested children, ownerId set on all rows", async () => {
    const user = await createTestUser();
    const linkable = await createWordRow(user.id, "linkable");

    const created = await createWordForUser(
      user.id,
      emptyForm("ubiquitous", {
        meanings: [
          {
            partOfSpeech: "adjective",
            pronunciation: "",
            texts: [{ text: "あちこちにある" }, { text: "遍在する" }],
            notes: [],
          },
        ],
        examples: [{ kind: "SENTENCE", text: "It is ubiquitous.", meaning: "", notes: [] }],
        relatedWords: [
          {
            kind: "SYNONYM",
            term: "omnipresent",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            notes: [],
            linkedWordId: linkable.id,
          },
        ],
        memos: [{ text: "TOEIC でよく出る" }],
      }),
    );

    const word = await prisma.word.findUnique({
      where: { id: created.id },
      include: {
        meanings: { include: { texts: true } },
        examples: true,
        relatedWords: true,
        memos: true,
      },
    });
    expect(word).not.toBeNull();
    expect(word!.ownerId).toBe(user.id);
    expect(word!.headword).toBe("ubiquitous");
    expect(word!.meanings).toHaveLength(1);
    expect(word!.meanings[0].ownerId).toBe(user.id);
    expect(word!.meanings[0].texts).toHaveLength(2);
    expect(word!.meanings[0].texts.map((t) => t.text)).toEqual(["あちこちにある", "遍在する"]);
    expect(word!.meanings[0].texts.every((t) => t.ownerId === user.id)).toBe(true);
    expect(word!.examples[0].ownerId).toBe(user.id);
    expect(word!.relatedWords[0].linkedWordId).toBe(linkable.id);
    expect(word!.memos[0].ownerId).toBe(user.id);
  });

  test("creates multiple notes per meaning/example/related word in sortOrder", async () => {
    const user = await createTestUser();
    const created = await createWordForUser(
      user.id,
      emptyForm("annotated", {
        meanings: [
          {
            partOfSpeech: "",
            pronunciation: "",
            texts: [{ text: "意味" }],
            notes: [{ text: "補足1" }, { text: "補足2" }],
          },
        ],
        examples: [{ kind: "SENTENCE", text: "ex", meaning: "", notes: [{ text: "例文補足" }] }],
        relatedWords: [
          {
            kind: "SYNONYM",
            term: "syn",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            notes: [{ text: "関連語補足A" }, { text: "関連語補足B" }],
            linkedWordId: null,
          },
        ],
      }),
    );

    const word = await prisma.word.findUnique({
      where: { id: created.id },
      include: {
        meanings: { include: { notes: { orderBy: { sortOrder: "asc" } } } },
        examples: { include: { notes: { orderBy: { sortOrder: "asc" } } } },
        relatedWords: { include: { notes: { orderBy: { sortOrder: "asc" } } } },
      },
    });
    expect(word!.meanings[0].notes.map((n) => n.text)).toEqual(["補足1", "補足2"]);
    expect(word!.meanings[0].notes.every((n) => n.ownerId === user.id)).toBe(true);
    expect(word!.examples[0].notes.map((n) => n.text)).toEqual(["例文補足"]);
    expect(word!.relatedWords[0].notes.map((n) => n.text)).toEqual(["関連語補足A", "関連語補足B"]);
  });

  test("trims whitespace from headword on insert", async () => {
    const user = await createTestUser();
    const created = await createWordForUser(user.id, emptyForm("   spaced   "));
    const word = await prisma.word.findUnique({ where: { id: created.id } });
    expect(word!.headword).toBe("spaced");
  });

  test("duplicate (ownerId, headword) throws DuplicateHeadwordError — validates meta.modelName='Word' contract", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, emptyForm("ubiquitous"));
    await expect(createWordForUser(user.id, emptyForm("ubiquitous"))).rejects.toBeInstanceOf(
      DuplicateHeadwordError,
    );
  });

  test("different users may reuse the same headword (unique is (ownerId, headword))", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const wA = await createWordForUser(userA.id, emptyForm("shared"));
    const wB = await createWordForUser(userB.id, emptyForm("shared"));
    expect(wB).toBeDefined();

    const rows = await prisma.word.findMany({
      where: { headword: "shared" },
      orderBy: { createdAt: "asc" },
      select: { id: true, ownerId: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id).sort()).toEqual([wA.id, wB.id].sort());
    const owners = rows.map((r) => r.ownerId).sort();
    expect(owners).toEqual([userA.id, userB.id].sort());
  });

  test("system register transfers existing single regular-user word; children stay with original owner", async () => {
    const userA = await createTestUser();
    const aWord = await createWordForUser(
      userA.id,
      emptyForm("apple", {
        meanings: [
          {
            partOfSpeech: "noun",
            pronunciation: "",
            texts: [{ text: "りんご (A)" }],
            notes: [],
          },
        ],
        examples: [{ kind: "SENTENCE", text: "I ate an apple.", meaning: "", notes: [] }],
      }),
    );

    const created = await createWordForUser(
      SYSTEM_USER_ID,
      emptyForm("apple", {
        meanings: [
          {
            partOfSpeech: "noun",
            pronunciation: "",
            texts: [{ text: "りんご (system)" }],
            notes: [],
          },
        ],
      }),
    );

    expect(created.id).toBe(aWord.id);

    const word = await prisma.word.findUnique({
      where: { id: aWord.id },
      include: {
        meanings: { include: { texts: true }, orderBy: { sortOrder: "asc" } },
        examples: true,
      },
    });
    expect(word).not.toBeNull();
    expect(word!.ownerId).toBe(SYSTEM_USER_ID);

    expect(word!.meanings).toHaveLength(2);
    const ownersOfMeanings = word!.meanings.map((m) => m.ownerId).sort();
    expect(ownersOfMeanings).toEqual([SYSTEM_USER_ID, userA.id].sort());

    expect(word!.examples).toHaveLength(1);
    expect(word!.examples[0].ownerId).toBe(userA.id);

    const all = await prisma.word.findMany({ where: { headword: "apple" } });
    expect(all).toHaveLength(1);
  });

  test("system register absorbs all regular-user rows when multiple users hold the headword", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await createWordForUser(
      userA.id,
      emptyForm("shared", {
        meanings: [{ partOfSpeech: "", pronunciation: "", texts: [{ text: "意味 A" }], notes: [] }],
      }),
    );
    await createWordForUser(
      userB.id,
      emptyForm("shared", {
        meanings: [{ partOfSpeech: "", pronunciation: "", texts: [{ text: "意味 B" }], notes: [] }],
      }),
    );

    await createWordForUser(
      SYSTEM_USER_ID,
      emptyForm("shared", {
        meanings: [
          { partOfSpeech: "", pronunciation: "", texts: [{ text: "意味 system" }], notes: [] },
        ],
      }),
    );

    const rows = await prisma.word.findMany({
      where: { headword: "shared" },
      include: { meanings: { include: { texts: true } } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerId).toBe(SYSTEM_USER_ID);

    const meaningOwners = rows[0].meanings.map((m) => m.ownerId).sort();
    expect(meaningOwners).toEqual([SYSTEM_USER_ID, userA.id, userB.id].sort());

    const allTexts = rows[0].meanings.flatMap((m) => m.texts.map((t) => t.text)).sort();
    expect(allTexts).toEqual(["意味 A", "意味 B", "意味 system"].sort());
  });

  test("system register throws DuplicateHeadwordError when (system, X) already exists", async () => {
    const userA = await createTestUser();
    const aWord = await createWordRow(userA.id, "dup");
    await prisma.word.create({
      data: { ownerId: SYSTEM_USER_ID, headword: "dup" },
      select: { id: true },
    });

    await expect(createWordForUser(SYSTEM_USER_ID, emptyForm("dup"))).rejects.toBeInstanceOf(
      DuplicateHeadwordError,
    );

    const aStill = await prisma.word.findUnique({ where: { id: aWord.id } });
    expect(aStill).not.toBeNull();
    expect(aStill!.ownerId).toBe(userA.id);
  });

  test("system register dedups WordOccurrence when multiple regular users reference the same system occurrence", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const sysOcc = await getSystemOccurrence("ターゲット1900");

    await createWordForUser(
      userA.id,
      emptyForm("shared", {
        occurrences: [
          {
            occurrenceId: sysOcc.id,
            ownerId: "",
            occurrenceOwnerId: SYSTEM_USER_ID,
            location: "ターゲット1900",
            occurrenceNumber: 11,
            details: [{ detail: "A の詳細" }],
          },
        ],
      }),
    );
    await createWordForUser(
      userB.id,
      emptyForm("shared", {
        occurrences: [
          {
            occurrenceId: sysOcc.id,
            ownerId: "",
            occurrenceOwnerId: SYSTEM_USER_ID,
            location: "ターゲット1900",
            occurrenceNumber: 12,
            details: [{ detail: "B の詳細" }],
          },
        ],
      }),
    );

    await createWordForUser(SYSTEM_USER_ID, emptyForm("shared"));

    const word = await prisma.word.findFirst({
      where: { headword: "shared" },
      include: {
        wordOccurrences: { include: { details: true } },
      },
    });
    expect(word).not.toBeNull();
    expect(word!.ownerId).toBe(SYSTEM_USER_ID);
    expect(word!.wordOccurrences).toHaveLength(1);
    const details = word!.wordOccurrences[0].details.map((d) => d.detail).sort();
    expect(details).toEqual(["A の詳細", "B の詳細"].sort());
  });

  test("system register repoints linkedWordId from other words to the surviving primary id", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const aApple = await createWordForUser(userA.id, emptyForm("apple"));
    const bApple = await createWordForUser(userB.id, emptyForm("apple"));

    await createWordForUser(
      userA.id,
      emptyForm("fruit-a", {
        relatedWords: [
          {
            kind: "SYNONYM",
            term: "apple-syn-a",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            notes: [],
            linkedWordId: aApple.id,
          },
        ],
      }),
    );
    await createWordForUser(
      userB.id,
      emptyForm("fruit-b", {
        relatedWords: [
          {
            kind: "SYNONYM",
            term: "apple-syn-b",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            notes: [],
            linkedWordId: bApple.id,
          },
        ],
      }),
    );

    await createWordForUser(SYSTEM_USER_ID, emptyForm("apple"));

    const surviving = await prisma.word.findFirst({
      where: { headword: "apple" },
      select: { id: true, ownerId: true },
    });
    expect(surviving).not.toBeNull();
    expect(surviving!.ownerId).toBe(SYSTEM_USER_ID);
    expect(surviving!.id).toBe(aApple.id);

    const relatedRows = await prisma.relatedWord.findMany({
      where: { term: { in: ["apple-syn-a", "apple-syn-b"] } },
      select: { term: true, linkedWordId: true },
    });
    expect(relatedRows).toHaveLength(2);
    for (const r of relatedRows) {
      expect(r.linkedWordId).toBe(surviving!.id);
    }
  });

  test("regular user supplied occurrenceNumber on a system Occurrence is silently nulled", async () => {
    const user = await createTestUser();
    const sysOcc = await getSystemOccurrence("ターゲット1900");

    const created = await createWordForUser(
      user.id,
      emptyForm("first", {
        occurrences: [
          {
            occurrenceId: sysOcc.id,
            ownerId: "",
            occurrenceOwnerId: SYSTEM_USER_ID,
            location: "ターゲット1900",
            occurrenceNumber: 1,
            details: [],
          },
        ],
      }),
    );

    const wo = await prisma.wordOccurrence.findFirstOrThrow({
      where: { wordId: created.id },
    });
    expect(wo.occurrenceNumber).toBeNull();
  });

  test("system editor: duplicate (occurrenceId, occurrenceNumber) throws DuplicateOccurrenceNumberError — validates meta.modelName='WordOccurrence' contract", async () => {
    const sysOcc = await getSystemOccurrence("ターゲット1900");

    await createWordForUser(
      SYSTEM_USER_ID,
      emptyForm("first-sys", {
        occurrences: [
          {
            occurrenceId: sysOcc.id,
            ownerId: "",
            occurrenceOwnerId: SYSTEM_USER_ID,
            location: "ターゲット1900",
            occurrenceNumber: 1,
            details: [],
          },
        ],
      }),
    );

    await expect(
      createWordForUser(
        SYSTEM_USER_ID,
        emptyForm("second-sys", {
          occurrences: [
            {
              occurrenceId: sysOcc.id,
              ownerId: "",
              occurrenceOwnerId: SYSTEM_USER_ID,
              location: "ターゲット1900",
              occurrenceNumber: 1,
              details: [],
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateOccurrenceNumberError);
  });

  test("inline location matching a system Occurrence silently nulls occurrenceNumber for regular user", async () => {
    const user = await createTestUser();
    const sysOcc = await getSystemOccurrence("ターゲット1900");

    const created = await createWordForUser(
      user.id,
      emptyForm("inline-sys-with-number", {
        occurrences: [
          {
            occurrenceId: "",
            ownerId: "",
            occurrenceOwnerId: "",
            location: "ターゲット1900",
            occurrenceNumber: 5,
            details: [],
          },
        ],
      }),
    );

    const wo = await prisma.wordOccurrence.findFirstOrThrow({
      where: { wordId: created.id },
    });
    expect(wo.occurrenceId).toBe(sysOcc.id);
    expect(wo.occurrenceNumber).toBeNull();
  });

  test("user-owned Occurrence keeps the regular user supplied occurrenceNumber", async () => {
    const user = await createTestUser();

    const created = await createWordForUser(
      user.id,
      emptyForm("own-occ-with-number", {
        occurrences: [
          {
            occurrenceId: "",
            ownerId: "",
            occurrenceOwnerId: "",
            location: "自分の出典",
            occurrenceNumber: 3,
            details: [],
          },
        ],
      }),
    );

    const wo = await prisma.wordOccurrence.findFirstOrThrow({
      where: { wordId: created.id },
      include: { occurrence: true },
    });
    expect(wo.occurrence.ownerId).toBe(user.id);
    expect(wo.occurrenceNumber).toBe(3);
  });

  test("out-of-scope linkedWordId is silently nulled, not linked", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const strangerWord = await createWordRow(stranger.id, "secret");

    const created = await createWordForUser(
      user.id,
      emptyForm("bogus-link", {
        relatedWords: [
          {
            kind: "SYNONYM",
            term: "ghost",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            notes: [],
            linkedWordId: strangerWord.id,
          },
        ],
      }),
    );
    const rw = await prisma.relatedWord.findFirst({ where: { wordId: created.id } });
    expect(rw).not.toBeNull();
    expect(rw!.linkedWordId).toBeNull();
  });

  test("out-of-scope preset occurrenceId falls back to upserting by location", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const strangerOcc = await createOccurrenceRow(stranger.id, "プライベート出典");

    const created = await createWordForUser(
      user.id,
      emptyForm("fallback-occ", {
        occurrences: [
          {
            occurrenceId: strangerOcc.id,
            ownerId: "",
            occurrenceOwnerId: stranger.id,
            location: "プライベート出典",
            occurrenceNumber: null,
            details: [],
          },
        ],
      }),
    );
    const wo = await prisma.wordOccurrence.findFirst({
      where: { wordId: created.id },
      include: { occurrence: true },
    });
    expect(wo).not.toBeNull();
    expect(wo!.occurrence.ownerId).toBe(user.id);
    expect(wo!.occurrence.location).toBe("プライベート出典");
    expect(wo!.occurrence.id).not.toBe(strangerOcc.id);
  });

  test("inline new occurrence with system-owned location auto-links to the system occurrence", async () => {
    const user = await createTestUser();
    const sysOcc = await getSystemOccurrence("ターゲット1900");
    const beforeOwn = await prisma.occurrence.count({ where: { ownerId: user.id } });

    const created = await createWordForUser(
      user.id,
      emptyForm("auto-link", {
        occurrences: [
          {
            occurrenceId: "",
            ownerId: "",
            occurrenceOwnerId: "",
            location: "ターゲット1900",
            occurrenceNumber: null,
            details: [],
          },
        ],
      }),
    );

    const wo = await prisma.wordOccurrence.findFirstOrThrow({
      where: { wordId: created.id },
      include: { occurrence: true },
    });
    expect(wo.occurrenceId).toBe(sysOcc.id);
    expect(wo.occurrence.ownerId).toBe(SYSTEM_USER_ID);

    const afterOwn = await prisma.occurrence.count({ where: { ownerId: user.id } });
    expect(afterOwn).toBe(beforeOwn);
  });

  test("preset occurrence within scope (system) is linked, with regular user number nulled", async () => {
    const user = await createTestUser();
    const sysOcc = await getSystemOccurrence("システム英単語");
    const created = await createWordForUser(
      user.id,
      emptyForm("with-system-occ", {
        occurrences: [
          {
            occurrenceId: sysOcc.id,
            ownerId: "",
            occurrenceOwnerId: SYSTEM_USER_ID,
            location: "システム英単語",
            occurrenceNumber: 42,
            details: [{ detail: "テスト備考" }],
          },
        ],
      }),
    );
    const wo = await prisma.wordOccurrence.findFirst({
      where: { wordId: created.id },
      include: { details: true },
    });
    expect(wo!.occurrenceId).toBe(sysOcc.id);
    expect(wo!.occurrenceNumber).toBeNull();
    expect(wo!.details).toHaveLength(1);
    expect(wo!.details[0].detail).toBe("テスト備考");
  });
});
