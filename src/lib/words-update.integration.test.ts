import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import type { WordFormValues } from "@/lib/schema/word-form";
import { wordDetailToFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser, DuplicateHeadwordError } from "@/lib/words-create";
import { getWordDetailForUser } from "@/lib/words-detail";
import { ForbiddenUpdateError, updateWordForUser } from "@/lib/words-update";

import { createTestUser, getSystemOccurrence } from "../../tests/setup/fixtures";

function minimalForm(headword: string): WordFormValues {
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
      notes: [],
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

  test("regular user can append their own note to a system meaning while preserving the system note", async () => {
    const sysForm = minimalForm("with-system-note");
    sysForm.meanings[0].notes = [{ text: "共通の補足" }];
    const sysWord = await createWordForUser(SYSTEM_USER_ID, sysForm);
    const user = await createTestUser();

    const detail = await getWordDetailForUser(user.id, sysWord.id);
    const form = wordDetailToFormValues(detail!);
    // the system note round-trips with its ownerId; the user appends their own.
    expect(form.meanings[0].notes).toHaveLength(1);
    expect(form.meanings[0].notes[0].ownerId).toBe(SYSTEM_USER_ID);
    form.meanings[0].notes.push({ text: "自分の補足" });
    await updateWordForUser(user.id, sysWord.id, form);

    const meaning = await prisma.meaning.findFirstOrThrow({
      where: { wordId: sysWord.id },
      include: { notes: { orderBy: { sortOrder: "asc" } } },
    });
    expect(meaning.notes.map((n) => ({ text: n.text, ownerId: n.ownerId }))).toEqual([
      { text: "共通の補足", ownerId: SYSTEM_USER_ID },
      { text: "自分の補足", ownerId: user.id },
    ]);
  });

  test("forbidden: regular user cannot drop a system-owned note during pass-through", async () => {
    const sysForm = minimalForm("with-deletable-note");
    sysForm.meanings[0].notes = [{ text: "消せない共通補足" }];
    const sysWord = await createWordForUser(SYSTEM_USER_ID, sysForm);
    const user = await createTestUser();

    const detail = await getWordDetailForUser(user.id, sysWord.id);
    const form = wordDetailToFormValues(detail!);
    // attempt to drop the system note
    form.meanings[0].notes = [];
    await expect(updateWordForUser(user.id, sysWord.id, form)).rejects.toBeInstanceOf(
      ForbiddenUpdateError,
    );
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

  test("editing a regular-user-owned WordOccurrence linked to a system Occurrence silently nulls the occurrenceNumber", async () => {
    const user = await createTestUser();
    const sysOcc = await getSystemOccurrence("ターゲット1900");
    const word = await createWordForUser(user.id, minimalForm("legacy-dirty"));
    await prisma.wordOccurrence.create({
      data: {
        wordId: word.id,
        occurrenceId: sysOcc.id,
        ownerId: user.id,
        occurrenceNumber: 42,
        sortOrder: 0,
      },
    });

    const detail = await getWordDetailForUser(user.id, word.id);
    const form = wordDetailToFormValues(detail!);
    await updateWordForUser(user.id, word.id, form);

    const wo = await prisma.wordOccurrence.findFirstOrThrow({
      where: { wordId: word.id },
    });
    expect(wo.occurrenceId).toBe(sysOcc.id);
    expect(wo.occurrenceNumber).toBeNull();
  });

  test("system editor can update occurrenceNumber on their own WordOccurrence linked to a system Occurrence", async () => {
    const sysOcc = await getSystemOccurrence("ターゲット1900");
    const word = await createWordForUser(SYSTEM_USER_ID, {
      ...minimalForm("sys-numbered"),
      occurrences: [
        {
          occurrenceId: sysOcc.id,
          ownerId: "",
          occurrenceOwnerId: SYSTEM_USER_ID,
          location: "ターゲット1900",
          occurrenceNumber: 10,
          details: [],
        },
      ],
    });

    const detail = await getWordDetailForUser(SYSTEM_USER_ID, word.id);
    const form = wordDetailToFormValues(detail!);
    form.occurrences[0].occurrenceNumber = 99;
    await updateWordForUser(SYSTEM_USER_ID, word.id, form);

    const wo = await prisma.wordOccurrence.findFirstOrThrow({
      where: { wordId: word.id },
    });
    expect(wo.occurrenceNumber).toBe(99);
  });

  test("regular user keeps occurrenceNumber when WordOccurrence links to their own Occurrence", async () => {
    const user = await createTestUser();
    const word = await createWordForUser(user.id, {
      ...minimalForm("own-numbered"),
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
    });

    const detail = await getWordDetailForUser(user.id, word.id);
    const form = wordDetailToFormValues(detail!);
    form.occurrences[0].occurrenceNumber = 7;
    await updateWordForUser(user.id, word.id, form);

    const wo = await prisma.wordOccurrence.findFirstOrThrow({
      where: { wordId: word.id },
      include: { occurrence: true },
    });
    expect(wo.occurrence.ownerId).toBe(user.id);
    expect(wo.occurrenceNumber).toBe(7);
  });
});
