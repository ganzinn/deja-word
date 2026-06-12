import { describe, expect, test } from "vitest";

import { getOccurrenceForUser } from "@/lib/occurrences-detail";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import {
  SYSTEM_OCCURRENCE_LOCATIONS,
  createOccurrenceRow,
  createQuizWordRow,
  createTestUser,
  getSystemOccurrence,
} from "../../tests/setup/fixtures";

describe("getOccurrenceForUser", () => {
  test("returns null for other users' occurrences", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const bOwn = await createOccurrenceRow(b.id, "B's", 0, [b.id]);
    expect(await getOccurrenceForUser(a.id, bOwn.id)).toBeNull();
  });

  test("wordLinkCount counts only system + own word links", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const sys = await getSystemOccurrence(SYSTEM_OCCURRENCE_LOCATIONS[0]);
    await createQuizWordRow(SYSTEM_USER_ID, "sys-word", {
      occurrence: { id: sys.id, occurrenceNumber: 1 },
    });
    await createQuizWordRow(a.id, "a-word", {
      occurrence: { id: sys.id, occurrenceNumber: null },
    });
    await createQuizWordRow(b.id, "b-word", {
      occurrence: { id: sys.id, occurrenceNumber: null },
    });

    const forA = await getOccurrenceForUser(a.id, sys.id);
    expect(forA!.wordLinkCount).toBe(2);

    const forSystem = await getOccurrenceForUser(SYSTEM_USER_ID, sys.id);
    expect(forSystem!.wordLinkCount).toBe(1);
  });
});
