import { describe, expect, test } from "vitest";

import type { WordFormValues } from "@/lib/schema/word-form";
import { SYSTEM_USER_ID } from "@/lib/system-user";
import { createWordForUser } from "@/lib/words-create";
import { getWordDetailForUser } from "@/lib/words-detail";

import { createTestUser } from "../../tests/setup/fixtures";

function form(headword: string): WordFormValues {
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
