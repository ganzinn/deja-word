import { describe, expect, test } from "vitest";

import { getAutoNumberOccurrencesForUser } from "@/lib/occurrences-auto-number";
import { prisma } from "@/lib/prisma";

import { createQuizWordRow, createTestUser } from "../../tests/setup/fixtures";

async function createOccurrence(ownerId: string, location: string, autoNumbering: boolean) {
  return prisma.occurrence.create({
    data: { ownerId, location, autoNumbering },
    select: { id: true },
  });
}

describe("getAutoNumberOccurrencesForUser", () => {
  test("returns only own occurrences with autoNumbering ON", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const on = await createOccurrence(user.id, "ON own", true);
    await createOccurrence(user.id, "OFF own", false);
    await createOccurrence(other.id, "ON other", true);

    const result = await getAutoNumberOccurrencesForUser(user.id);
    expect(result.map((o) => o.id)).toEqual([on.id]);
  });

  test("nextNumber is 1 when the occurrence has no numbered words", async () => {
    const user = await createTestUser();
    const occ = await createOccurrence(user.id, "空", true);
    const result = await getAutoNumberOccurrencesForUser(user.id);
    expect(result).toEqual([{ id: occ.id, ownerId: user.id, location: "空", nextNumber: 1 }]);
  });

  test("nextNumber is max + 1, even with gaps", async () => {
    const user = await createTestUser();
    const occ = await createOccurrence(user.id, "連番", true);
    for (const n of [1, 2, 5]) {
      await createQuizWordRow(user.id, `w-${n}`, {
        occurrence: { id: occ.id, occurrenceNumber: n },
      });
    }
    // 番号なしの単語は最大値に影響しない
    await createQuizWordRow(user.id, "w-null", {
      occurrence: { id: occ.id, occurrenceNumber: null },
    });

    const result = await getAutoNumberOccurrencesForUser(user.id);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: occ.id, nextNumber: 6 });
  });

  test("returns empty array when the user has no auto-numbering occurrences", async () => {
    const user = await createTestUser();
    await createOccurrence(user.id, "OFF", false);
    expect(await getAutoNumberOccurrencesForUser(user.id)).toEqual([]);
  });
});
