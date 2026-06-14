import { describe, expect, test } from "vitest";

import type { BlobClient } from "@/lib/blob-client";
import {
  ForbiddenUpdateError,
  deletePronunciationAudioForUser,
  deleteRelatedWordAudioForUser,
  uploadPronunciationAudioForUser,
  uploadRelatedWordAudioForUser,
} from "@/lib/pronunciation-audio";
import { prisma } from "@/lib/prisma";
import type { WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser } from "@/lib/words-create";
import { deleteWordForUser } from "@/lib/words-delete";
import { updateWordForUser } from "@/lib/words-update";

import { createTestUser } from "../../tests/setup/fixtures";

/** put した pathname と del された URL を記録するインメモリ BlobClient。 */
function fakeBlob() {
  const puts: string[] = [];
  const deleted = new Set<string>();
  let seq = 0;
  const blob: BlobClient = {
    async put(pathname) {
      seq += 1;
      puts.push(pathname);
      return { url: `https://blob.test/${pathname}-${seq}` };
    },
    async del(url) {
      for (const u of Array.isArray(url) ? url : [url]) deleted.add(u);
    },
  };
  return { blob, puts, deleted };
}

function form(headword: string, overrides: Partial<WordFormValues> = {}): WordFormValues {
  return {
    headword,
    meanings: [{ partOfSpeech: "", pronunciation: "", texts: [{ text: "意味" }], notes: [] }],
    examples: [],
    relatedWords: [],
    memos: [],
    occurrences: [],
    ...overrides,
  };
}

async function firstMeaningId(wordId: string): Promise<string> {
  const m = await prisma.meaning.findFirst({ where: { wordId }, select: { id: true } });
  if (!m) throw new Error("meaning not found");
  return m.id;
}

async function firstRelatedWordId(wordId: string): Promise<string> {
  const r = await prisma.relatedWord.findFirst({ where: { wordId }, select: { id: true } });
  if (!r) throw new Error("related word not found");
  return r.id;
}

function relatedWord(term: string): WordFormValues["relatedWords"][number] {
  return { term, partOfSpeech: "", pronunciation: "", meaning: "", notes: [] };
}

function mp3(): File {
  return new File([new Uint8Array(2048)], "a.mp3", { type: "audio/mpeg" });
}

describe("meaning-audio: upload → 差し替え → 削除", () => {
  test("DB カラムが更新され、差し替え・削除で旧 Blob が del される", async () => {
    const user = await createTestUser();
    const word = await createWordForUser(user.id, form("audible"));
    const meaningId = await firstMeaningId(word.id);
    const { blob, deleted } = fakeBlob();

    const first = await uploadPronunciationAudioForUser(user.id, meaningId, mp3(), blob);
    expect(
      (await prisma.meaning.findUniqueOrThrow({ where: { id: meaningId } })).pronunciationAudioUrl,
    ).toBe(first.url);

    const second = await uploadPronunciationAudioForUser(user.id, meaningId, mp3(), blob);
    expect(
      (await prisma.meaning.findUniqueOrThrow({ where: { id: meaningId } })).pronunciationAudioUrl,
    ).toBe(second.url);
    expect(deleted.has(first.url)).toBe(true); // 旧 URL が回収された

    await deletePronunciationAudioForUser(user.id, meaningId, blob);
    expect(
      (await prisma.meaning.findUniqueOrThrow({ where: { id: meaningId } })).pronunciationAudioUrl,
    ).toBeNull();
    expect(deleted.has(second.url)).toBe(true);
  });
});

describe("meaning-audio: Blob クリーンアップ", () => {
  test("Word 削除で配下 Meaning の発音音源が一括 del される", async () => {
    const user = await createTestUser();
    const word = await createWordForUser(user.id, form("toDelete"));
    const meaningId = await firstMeaningId(word.id);
    const { blob, deleted } = fakeBlob();

    const pron = await uploadPronunciationAudioForUser(user.id, meaningId, mp3(), blob);

    await deleteWordForUser(user.id, word.id, blob);

    expect(await prisma.word.findUnique({ where: { id: word.id } })).toBeNull();
    expect(deleted.has(pron.url)).toBe(true);
  });

  test("編集の orphan delete で消えた Meaning の音源も del される", async () => {
    const user = await createTestUser();
    const word = await createWordForUser(
      user.id,
      form("editable", {
        meanings: [
          { partOfSpeech: "", pronunciation: "", texts: [{ text: "残す" }], notes: [] },
          { partOfSpeech: "", pronunciation: "", texts: [{ text: "消す" }], notes: [] },
        ],
      }),
    );
    const meanings = await prisma.meaning.findMany({
      where: { wordId: word.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, ownerId: true, texts: { select: { id: true, text: true } } },
    });
    const keep = meanings[0];
    const drop = meanings[1];
    const { blob, deleted } = fakeBlob();

    const dropped = await uploadPronunciationAudioForUser(user.id, drop.id, mp3(), blob);

    // フォームから drop を落として更新 → orphan delete → 音源も del
    await updateWordForUser(
      user.id,
      word.id,
      form("editable", {
        meanings: [
          {
            id: keep.id,
            ownerId: user.id,
            partOfSpeech: "",
            pronunciation: "",
            texts: [{ id: keep.texts[0].id, ownerId: user.id, text: keep.texts[0].text }],
            notes: [],
          },
        ],
      }),
      blob,
    );

    expect(await prisma.meaning.findUnique({ where: { id: drop.id } })).toBeNull();
    expect(await prisma.meaning.findUnique({ where: { id: keep.id } })).not.toBeNull();
    expect(deleted.has(dropped.url)).toBe(true);
  });
});

describe("meaning-audio: 認可（owner 不一致）", () => {
  test("他人の Meaning は mutate 拒否", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const word = await createWordForUser(owner.id, form("ownersWord"));
    const meaningId = await firstMeaningId(word.id);
    const { blob } = fakeBlob();

    await expect(
      uploadPronunciationAudioForUser(stranger.id, meaningId, mp3(), blob),
    ).rejects.toBeInstanceOf(ForbiddenUpdateError);
  });

  test("一般ユーザーは SYSTEM 所有 Meaning を mutate できない", async () => {
    const sysWord = await createWordForUser(SYSTEM_USER_ID, form("systemWord"));
    const meaningId = await firstMeaningId(sysWord.id);
    const user = await createTestUser();
    const { blob } = fakeBlob();

    await expect(
      uploadPronunciationAudioForUser(user.id, meaningId, mp3(), blob),
    ).rejects.toBeInstanceOf(ForbiddenUpdateError);
  });

  test("SYSTEM は自身の Meaning を mutate できる", async () => {
    const sysWord = await createWordForUser(SYSTEM_USER_ID, form("systemOwn"));
    const meaningId = await firstMeaningId(sysWord.id);
    const { blob } = fakeBlob();

    const result = await uploadPronunciationAudioForUser(SYSTEM_USER_ID, meaningId, mp3(), blob);
    expect(
      (await prisma.meaning.findUniqueOrThrow({ where: { id: meaningId } })).pronunciationAudioUrl,
    ).toBe(result.url);
  });
});

describe("related-word-audio: upload → 差し替え → 削除", () => {
  test("DB カラムが更新され、差し替え・削除で旧 Blob が del される", async () => {
    const user = await createTestUser();
    const word = await createWordForUser(
      user.id,
      form("relTerm", { relatedWords: [relatedWord("synonym")] }),
    );
    const relatedId = await firstRelatedWordId(word.id);
    const { blob, puts, deleted } = fakeBlob();

    const first = await uploadRelatedWordAudioForUser(user.id, relatedId, mp3(), blob);
    expect(puts[0]).toBe(`audio/related-word/${relatedId}/pronunciation.mp3`);
    expect(
      (await prisma.relatedWord.findUniqueOrThrow({ where: { id: relatedId } }))
        .pronunciationAudioUrl,
    ).toBe(first.url);

    const second = await uploadRelatedWordAudioForUser(user.id, relatedId, mp3(), blob);
    expect(
      (await prisma.relatedWord.findUniqueOrThrow({ where: { id: relatedId } }))
        .pronunciationAudioUrl,
    ).toBe(second.url);
    expect(deleted.has(first.url)).toBe(true);

    await deleteRelatedWordAudioForUser(user.id, relatedId, blob);
    expect(
      (await prisma.relatedWord.findUniqueOrThrow({ where: { id: relatedId } }))
        .pronunciationAudioUrl,
    ).toBeNull();
    expect(deleted.has(second.url)).toBe(true);
  });
});

describe("related-word-audio: Blob クリーンアップ", () => {
  test("Word 削除で配下 関連語の発音音源が一括 del される", async () => {
    const user = await createTestUser();
    const word = await createWordForUser(
      user.id,
      form("relToDelete", { relatedWords: [relatedWord("syn")] }),
    );
    const relatedId = await firstRelatedWordId(word.id);
    const { blob, deleted } = fakeBlob();

    const pron = await uploadRelatedWordAudioForUser(user.id, relatedId, mp3(), blob);

    await deleteWordForUser(user.id, word.id, blob);

    expect(await prisma.word.findUnique({ where: { id: word.id } })).toBeNull();
    expect(deleted.has(pron.url)).toBe(true);
  });

  test("編集の orphan delete で消えた 関連語の音源も del される", async () => {
    const user = await createTestUser();
    const word = await createWordForUser(
      user.id,
      form("relEditable", { relatedWords: [relatedWord("keep"), relatedWord("drop")] }),
    );
    const related = await prisma.relatedWord.findMany({
      where: { wordId: word.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, ownerId: true, term: true },
    });
    const keep = related[0];
    const drop = related[1];
    const { blob, deleted } = fakeBlob();

    const dropped = await uploadRelatedWordAudioForUser(user.id, drop.id, mp3(), blob);

    // フォームから drop を落として更新 → orphan delete → 音源も del
    await updateWordForUser(
      user.id,
      word.id,
      form("relEditable", {
        relatedWords: [
          {
            id: keep.id,
            ownerId: user.id,
            term: keep.term,
            partOfSpeech: "",
            pronunciation: "",
            meaning: "",
            notes: [],
          },
        ],
      }),
      blob,
    );

    expect(await prisma.relatedWord.findUnique({ where: { id: drop.id } })).toBeNull();
    expect(await prisma.relatedWord.findUnique({ where: { id: keep.id } })).not.toBeNull();
    expect(deleted.has(dropped.url)).toBe(true);
  });
});

describe("related-word-audio: 認可（owner 不一致）", () => {
  test("他人の関連語は mutate 拒否", async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const word = await createWordForUser(
      owner.id,
      form("relOwners", { relatedWords: [relatedWord("syn")] }),
    );
    const relatedId = await firstRelatedWordId(word.id);
    const { blob } = fakeBlob();

    await expect(
      uploadRelatedWordAudioForUser(stranger.id, relatedId, mp3(), blob),
    ).rejects.toBeInstanceOf(ForbiddenUpdateError);
  });
});
