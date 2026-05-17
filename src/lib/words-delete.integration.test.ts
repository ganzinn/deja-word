import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import type { WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser } from "@/lib/words-create";
import {
  WordNotFoundError,
  countIncomingLinksForUser,
  deleteWordForUser,
} from "@/lib/words-delete";

import { createTestUser } from "../../tests/setup/fixtures";

function form(headword: string, overrides: Partial<WordFormValues> = {}): WordFormValues {
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

describe("deleteWordForUser", () => {
  test("own word delete cascades to all children", async () => {
    const user = await createTestUser();
    const word = await createWordForUser(
      user.id,
      form("toDelete", {
        examples: [{ kind: "PHRASE", text: "a thing", meaning: "", note: "" }],
        memos: [{ text: "memo" }],
      }),
    );

    await deleteWordForUser(user.id, word.id);

    const remaining = await prisma.word.findUnique({ where: { id: word.id } });
    expect(remaining).toBeNull();
    expect(await prisma.meaning.count({ where: { wordId: word.id } })).toBe(0);
    expect(await prisma.example.count({ where: { wordId: word.id } })).toBe(0);
    expect(await prisma.memo.count({ where: { wordId: word.id } })).toBe(0);
  });

  test("foreign word: WordNotFoundError", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const strangerWord = await createWordForUser(stranger.id, form("strangers"));
    await expect(deleteWordForUser(user.id, strangerWord.id)).rejects.toBeInstanceOf(
      WordNotFoundError,
    );
  });

  test("system word cannot be deleted by a regular user (delete uses ownerId === userId)", async () => {
    const sysWord = await createWordForUser(SYSTEM_USER_ID, form("system-immutable"));
    const user = await createTestUser();
    await expect(deleteWordForUser(user.id, sysWord.id)).rejects.toBeInstanceOf(WordNotFoundError);
    expect(await prisma.word.findUnique({ where: { id: sysWord.id } })).not.toBeNull();
  });
});

describe("countIncomingLinksForUser", () => {
  test("counts user-owned relatedWords that link to the given wordId, excluding self-references", async () => {
    const user = await createTestUser();
    const target = await createWordForUser(user.id, form("target"));
    const linker = await createWordForUser(
      user.id,
      form("linker", {
        relatedWords: [
          {
            kind: "SYNONYM",
            term: "alt",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            note: "",
            linkedWordId: target.id,
          },
        ],
      }),
    );
    // self-reference: a word linking to itself should not be counted
    await prisma.relatedWord.create({
      data: {
        wordId: target.id,
        ownerId: user.id,
        term: "self",
        linkedWordId: target.id,
        sortOrder: 99,
      },
    });

    const count = await countIncomingLinksForUser(user.id, target.id);
    expect(count).toBe(1);
    expect(linker.id).toBeTruthy();
  });

  test("does not count other users' incoming links", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const target = await createWordForUser(userA.id, form("target"));
    await createWordForUser(
      userB.id,
      form("by-B", {
        relatedWords: [
          {
            kind: "SYNONYM",
            term: "alt",
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            note: "",
            linkedWordId: target.id,
          },
        ],
      }),
    );
    const count = await countIncomingLinksForUser(userA.id, target.id);
    expect(count).toBe(0);
  });
});
