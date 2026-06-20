import { describe, expect, test } from "vitest";

import { SYSTEM_USER_ID } from "@/lib/system-user";
import { findOwnHeadwordDuplicate } from "@/lib/words-duplicate";

import { createTestUser, createWordRow } from "../../tests/setup/fixtures";

describe("findOwnHeadwordDuplicate", () => {
  test("returns the matching word for an exact same-owner headword", async () => {
    const user = await createTestUser();
    const word = await createWordRow(user.id, "ephemeral");

    const dup = await findOwnHeadwordDuplicate(user.id, "ephemeral");
    expect(dup).toEqual({ id: word.id, headword: "ephemeral" });
  });

  test("is case-sensitive: different case is not a duplicate", async () => {
    const user = await createTestUser();
    await createWordRow(user.id, "apple");

    expect(await findOwnHeadwordDuplicate(user.id, "Apple")).toBeNull();
  });

  test("trims whitespace before comparing", async () => {
    const user = await createTestUser();
    const word = await createWordRow(user.id, "spaced");

    const dup = await findOwnHeadwordDuplicate(user.id, "   spaced   ");
    expect(dup).toEqual({ id: word.id, headword: "spaced" });
  });

  test("ignores another user's word with the same headword", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    await createWordRow(stranger.id, "shared");

    expect(await findOwnHeadwordDuplicate(user.id, "shared")).toBeNull();
  });

  test("ignores a system (shared) word with the same headword", async () => {
    const user = await createTestUser();
    await createWordRow(SYSTEM_USER_ID, "ubiquitous");

    expect(await findOwnHeadwordDuplicate(user.id, "ubiquitous")).toBeNull();
  });

  test("excludes the word itself when editing via excludeWordId", async () => {
    const user = await createTestUser();
    const word = await createWordRow(user.id, "recursion");

    expect(await findOwnHeadwordDuplicate(user.id, "recursion", word.id)).toBeNull();
  });

  test("still flags a different word that collides while editing", async () => {
    const user = await createTestUser();
    const editing = await createWordRow(user.id, "editing-target");
    const other = await createWordRow(user.id, "collision");

    const dup = await findOwnHeadwordDuplicate(user.id, "collision", editing.id);
    expect(dup).toEqual({ id: other.id, headword: "collision" });
  });

  test("returns null for an empty/whitespace-only headword", async () => {
    const user = await createTestUser();
    expect(await findOwnHeadwordDuplicate(user.id, "   ")).toBeNull();
  });
});
