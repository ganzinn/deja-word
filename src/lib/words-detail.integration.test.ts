import { describe, expect, test } from "vitest";

import { prisma } from "@/lib/prisma";
import { type WordFormValues, wordDetailToFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser } from "@/lib/words-create";
import { getWordDetailForUser } from "@/lib/words-detail";
import { updateWordForUser } from "@/lib/words-update";

import { createTestUser } from "../../tests/setup/fixtures";

function form(headword: string): WordFormValues {
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

/** headword に関連語 term を 1 件持つフォーム（linkedWordId で他の英単語へリンクできる）。 */
function formWithRelated(
  headword: string,
  term: string,
  linkedWordId: string | null,
): WordFormValues {
  return {
    ...form(headword),
    relatedWords: [
      {
        kind: "SYNONYM",
        term,
        partOfSpeech: "",
        pronunciation: "",
        meaning: "",
        notes: [],
        linkedWordId,
      },
    ],
  };
}

/** wordId の meanings のうち sortOrder 番目（0 始まり）に発音音源を付ける。 */
async function setMeaningAudio(wordId: string, sortOrder: number, url: string) {
  const meaning = await prisma.meaning.findFirstOrThrow({
    where: { wordId, sortOrder },
    select: { id: true },
  });
  await prisma.meaning.update({ where: { id: meaning.id }, data: { pronunciationAudioUrl: url } });
}

describe("getWordDetailForUser", () => {
  test("returns the word with all children when user owns it", async () => {
    const user = await createTestUser();
    const created = await createWordForUser(user.id, form("ubiquitous"));
    const detail = await getWordDetailForUser(user.id, created.id);
    expect(detail).not.toBeNull();
    expect(detail!.headword).toBe("ubiquitous");
    expect(detail!.meanings).toHaveLength(1);
    expect(detail!.meanings[0].texts[0].text).toBe("意味");
  });

  test("returns the word for a system-owned word (system is in scopedOwnerIds)", async () => {
    const sysWord = await createWordForUser(SYSTEM_USER_ID, form("sysword"));
    const user = await createTestUser();
    const detail = await getWordDetailForUser(user.id, sysWord.id);
    expect(detail).not.toBeNull();
    expect(detail!.ownerId).toBe(SYSTEM_USER_ID);
  });

  test("returns null for a foreign user's word", async () => {
    const stranger = await createTestUser();
    const strangerWord = await createWordForUser(stranger.id, form("hidden"));
    const user = await createTestUser();
    const detail = await getWordDetailForUser(user.id, strangerWord.id);
    expect(detail).toBeNull();
  });

  test("returns null for an unknown wordId", async () => {
    const user = await createTestUser();
    const detail = await getWordDetailForUser(user.id, "nonexistent-id");
    expect(detail).toBeNull();
  });
});

// 関連語の発音ボタンは、関連語自身に音源が無いときリンク先英単語の音源を鳴らす。
// その材料（linkedWord.meanings）が正しく引けることの確認。
describe("getWordDetailForUser: linked word audio for related words", () => {
  test("carries the linked word's registered audio", async () => {
    const user = await createTestUser();
    const linked = await createWordForUser(user.id, form("acquire"));
    await setMeaningAudio(linked.id, 0, "/audio/acquire.mp3");
    const created = await createWordForUser(
      user.id,
      formWithRelated("obtain", "acquire", linked.id),
    );

    const detail = await getWordDetailForUser(user.id, created.id);
    expect(detail!.relatedWords[0].linkedWord?.meanings[0]?.pronunciationAudioUrl).toBe(
      "/audio/acquire.mp3",
    );
  });

  test("picks the first meaning that has audio, not the first meaning", async () => {
    const user = await createTestUser();
    const linkedForm = form("acquire");
    linkedForm.meanings.push({
      partOfSpeech: "",
      pronunciation: "",
      texts: [{ text: "2 つめの意味" }],
      notes: [],
    });
    const linked = await createWordForUser(user.id, linkedForm);
    await setMeaningAudio(linked.id, 1, "/audio/acquire.mp3");
    const created = await createWordForUser(
      user.id,
      formWithRelated("obtain", "acquire", linked.id),
    );

    const detail = await getWordDetailForUser(user.id, created.id);
    expect(detail!.relatedWords[0].linkedWord?.meanings[0]?.pronunciationAudioUrl).toBe(
      "/audio/acquire.mp3",
    );
  });

  test("meanings is empty when the linked word has no audio", async () => {
    const user = await createTestUser();
    const linked = await createWordForUser(user.id, form("acquire"));
    const created = await createWordForUser(
      user.id,
      formWithRelated("obtain", "acquire", linked.id),
    );

    const detail = await getWordDetailForUser(user.id, created.id);
    expect(detail!.relatedWords[0].linkedWord?.meanings).toEqual([]);
  });

  test("does not leak a foreign user's audio on a shared linked word", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const sysWord = await createWordForUser(SYSTEM_USER_ID, form("acquire"));

    // stranger が pass-through で自分の Meaning を付加し、そこにだけ音源がある状態にする
    // （音源の登録は別 Server Action の担当なので、ここでは DB 状態を直接構成する）
    const strangerDetail = await getWordDetailForUser(stranger.id, sysWord.id);
    const strangerForm = wordDetailToFormValues(strangerDetail!);
    strangerForm.meanings.push({
      partOfSpeech: "",
      pronunciation: "",
      texts: [{ text: "他人の私的な意味" }],
      notes: [],
    });
    await updateWordForUser(stranger.id, sysWord.id, strangerForm);
    const strangerMeaning = await prisma.meaning.findFirstOrThrow({
      where: { wordId: sysWord.id, ownerId: stranger.id },
      select: { id: true },
    });
    await prisma.meaning.update({
      where: { id: strangerMeaning.id },
      data: { pronunciationAudioUrl: "stranger-audio-key" },
    });

    const created = await createWordForUser(
      user.id,
      formWithRelated("obtain", "acquire", sysWord.id),
    );
    const detail = await getWordDetailForUser(user.id, created.id);
    expect(detail!.relatedWords[0].linkedWord?.meanings).toEqual([]);
  });
});
