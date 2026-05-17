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
        note: "",
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
            partOfSpeech: "adj",
            pronunciation: "",
            texts: [{ text: "あちこちにある" }, { text: "遍在する" }],
            note: "",
          },
        ],
        examples: [{ kind: "SENTENCE", text: "It is ubiquitous.", meaning: "", note: "" }],
        relatedWords: [
          {
            kind: "SYNONYM",
            term: "omnipresent",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            note: "",
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
    await createWordForUser(userA.id, emptyForm("shared"));
    await expect(createWordForUser(userB.id, emptyForm("shared"))).resolves.toBeDefined();
  });

  test("duplicate (occurrenceId, occurrenceNumber) throws DuplicateOccurrenceNumberError — validates meta.modelName='WordOccurrence' contract", async () => {
    const user = await createTestUser();
    const sysOcc = await getSystemOccurrence("ターゲット1900");

    await createWordForUser(
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

    await expect(
      createWordForUser(
        user.id,
        emptyForm("second", {
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
            note: "",
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

  test("preset occurrence within scope (system) is linked as-is", async () => {
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
    expect(wo!.occurrenceNumber).toBe(42);
    expect(wo!.details).toHaveLength(1);
    expect(wo!.details[0].detail).toBe("テスト備考");
  });
});
