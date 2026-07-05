import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import type { WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser } from "@/lib/words-create";
import {
  ForbiddenDeleteError,
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

describe("deleteWordForUser", () => {
  test("own word delete cascades to all children", async () => {
    const user = await createTestUser();
    const word = await createWordForUser(
      user.id,
      form("toDelete", {
        examples: [{ kind: "PHRASE", text: "a thing", meaning: "", notes: [] }],
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

  test("system word with only its own children can be deleted", async () => {
    const sysWord = await createWordForUser(SYSTEM_USER_ID, form("sys-solo"));
    await deleteWordForUser(SYSTEM_USER_ID, sysWord.id);
    expect(await prisma.word.findUnique({ where: { id: sysWord.id } })).toBeNull();
  });

  test("delete guard: system word with a user's pass-through child is not deletable; child survives", async () => {
    const user = await createTestUser();
    const sysWord = await createWordForUser(SYSTEM_USER_ID, form("guarded"));
    // 一般ユーザーが pass-through で system 単語に自分の意味を追加した状態
    const userMeaning = await prisma.meaning.create({
      data: {
        wordId: sysWord.id,
        ownerId: user.id,
        texts: { create: [{ ownerId: user.id, text: "私の意味" }] },
      },
      select: { id: true },
    });

    await expect(deleteWordForUser(SYSTEM_USER_ID, sysWord.id)).rejects.toBeInstanceOf(
      ForbiddenDeleteError,
    );

    // 単語もユーザーの意味も残る
    expect(await prisma.word.findUnique({ where: { id: sysWord.id } })).not.toBeNull();
    expect(await prisma.meaning.findUnique({ where: { id: userMeaning.id } })).not.toBeNull();
  });

  test("delete guard: even a foreign-owned grandchild (user text on a system meaning) blocks deletion", async () => {
    const user = await createTestUser();
    const sysWord = await createWordForUser(SYSTEM_USER_ID, form("guarded-grand"));
    const sysMeaning = await prisma.meaning.findFirst({
      where: { wordId: sysWord.id },
      select: { id: true },
    });
    await prisma.meaningText.create({
      data: { meaningId: sysMeaning!.id, ownerId: user.id, text: "私の訳" },
    });

    await expect(deleteWordForUser(SYSTEM_USER_ID, sysWord.id)).rejects.toBeInstanceOf(
      ForbiddenDeleteError,
    );
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
            notes: [],
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
            notes: [],
            linkedWordId: target.id,
          },
        ],
      }),
    );
    const count = await countIncomingLinksForUser(userA.id, target.id);
    expect(count).toBe(0);
  });
});
