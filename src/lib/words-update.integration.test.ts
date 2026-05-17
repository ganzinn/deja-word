import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import type { WordFormValues } from "@/lib/schema/word-form";
import { wordDetailToFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser, DuplicateHeadwordError } from "@/lib/words-create";
import { getWordDetailForUser } from "@/lib/words-detail";
import { ForbiddenUpdateError, updateWordForUser } from "@/lib/words-update";

import { createTestUser } from "../../tests/setup/fixtures";

function minimalForm(headword: string): WordFormValues {
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
  };
}

describe("updateWordForUser", () => {
  test("happy path: editor renames own word", async () => {
    const user = await createTestUser();
    const created = await createWordForUser(user.id, minimalForm("first"));
    const detail = await getWordDetailForUser(user.id, created.id);
    const form = wordDetailToFormValues(detail!);
    form.headword = "renamed";
    const result = await updateWordForUser(user.id, created.id, form);
    expect(result.id).toBe(created.id);
    const word = await prisma.word.findUnique({ where: { id: created.id } });
    expect(word!.headword).toBe("renamed");
  });

  test("not_found: WordNotFoundError when wordId is foreign", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const strangerWord = await createWordForUser(stranger.id, minimalForm("strangers"));
    await expect(
      updateWordForUser(user.id, strangerWord.id, minimalForm("x")),
    ).rejects.toThrowError(/WORD_NOT_FOUND/);
  });

  test("forbidden: regular user cannot change system word headword", async () => {
    const sysWord = await createWordForUser(SYSTEM_USER_ID, minimalForm("system-word"));
    const user = await createTestUser();
    const detail = await getWordDetailForUser(user.id, sysWord.id);
    const form = wordDetailToFormValues(detail!);
    form.headword = "tampered";
    await expect(updateWordForUser(user.id, sysWord.id, form)).rejects.toBeInstanceOf(
      ForbiddenUpdateError,
    );
  });

  test("forbidden: regular user cannot delete a system-owned meaning from a system word", async () => {
    const sysWord = await createWordForUser(SYSTEM_USER_ID, minimalForm("with-system-meaning"));
    const user = await createTestUser();
    const detail = await getWordDetailForUser(user.id, sysWord.id);
    const form = wordDetailToFormValues(detail!);
    // attempt to drop the system meaning entirely
    form.meanings = [];
    await expect(updateWordForUser(user.id, sysWord.id, form)).rejects.toBeInstanceOf(
      ForbiddenUpdateError,
    );
  });

  test("regular user can add their own meaning to a system word while preserving system meaning", async () => {
    const sysWord = await createWordForUser(SYSTEM_USER_ID, minimalForm("ubiquitous"));
    const user = await createTestUser();
    const detail = await getWordDetailForUser(user.id, sysWord.id);
    const form = wordDetailToFormValues(detail!);
    form.meanings.push({
      partOfSpeech: "",
      pronunciation: "",
      texts: [{ text: "ユーザー独自の意味" }],
      note: "",
    });
    await updateWordForUser(user.id, sysWord.id, form);

    const meanings = await prisma.meaning.findMany({
      where: { wordId: sysWord.id },
      orderBy: { sortOrder: "asc" },
      include: { texts: { orderBy: { sortOrder: "asc" } } },
    });
    expect(meanings).toHaveLength(2);
    expect(meanings[0].ownerId).toBe(SYSTEM_USER_ID);
    expect(meanings[1].ownerId).toBe(user.id);
    expect(meanings[1].texts[0].text).toBe("ユーザー独自の意味");
  });

  test("duplicate headword on rename throws DuplicateHeadwordError", async () => {
    const user = await createTestUser();
    await createWordForUser(user.id, minimalForm("alpha"));
    const beta = await createWordForUser(user.id, minimalForm("beta"));
    const detail = await getWordDetailForUser(user.id, beta.id);
    const form = wordDetailToFormValues(detail!);
    form.headword = "alpha";
    await expect(updateWordForUser(user.id, beta.id, form)).rejects.toBeInstanceOf(
      DuplicateHeadwordError,
    );
  });
});
