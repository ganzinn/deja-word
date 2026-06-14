import { describe, expect, test } from "vitest";

import {
  AutoNumberOccurrenceNotOwnedError,
  AutoNumberRequiresPresetError,
  disableAutoNumberingForUser,
  setAutoNumberingForUser,
} from "@/lib/occurrence-auto-number-settings";
import { prisma } from "@/lib/prisma";

import {
  SYSTEM_OCCURRENCE_LOCATIONS,
  createOccurrenceRow,
  createTestUser,
  getSystemOccurrence,
} from "../../tests/setup/fixtures";

async function readAutoNumbering(id: string) {
  const row = await prisma.occurrence.findUniqueOrThrow({
    where: { id },
    select: { autoNumbering: true },
  });
  return row.autoNumbering;
}

describe("setAutoNumberingForUser", () => {
  test("turns autoNumbering ON and OFF for own preset occurrence", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "own", 0, [user.id]);

    await setAutoNumberingForUser(user.id, occ.id, true);
    expect(await readAutoNumbering(occ.id)).toBe(true);

    await setAutoNumberingForUser(user.id, occ.id, false);
    expect(await readAutoNumbering(occ.id)).toBe(false);
  });

  test("rejects turning ON when the occurrence is not a preset", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "non-preset", 0);

    await expect(setAutoNumberingForUser(user.id, occ.id, true)).rejects.toBeInstanceOf(
      AutoNumberRequiresPresetError,
    );
    expect(await readAutoNumbering(occ.id)).toBe(false);
  });

  test("rejects toggling another user's occurrence", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const occ = await createOccurrenceRow(owner.id, "owner's", 0, [owner.id]);

    await expect(setAutoNumberingForUser(other.id, occ.id, true)).rejects.toBeInstanceOf(
      AutoNumberOccurrenceNotOwnedError,
    );
    expect(await readAutoNumbering(occ.id)).toBe(false);
  });

  test("rejects toggling a system-owned occurrence from a regular user", async () => {
    const user = await createTestUser();
    const sys = await getSystemOccurrence(SYSTEM_OCCURRENCE_LOCATIONS[0]);

    await expect(setAutoNumberingForUser(user.id, sys.id, true)).rejects.toBeInstanceOf(
      AutoNumberOccurrenceNotOwnedError,
    );
  });
});

describe("disableAutoNumberingForUser", () => {
  test("clears autoNumbering on own occurrence", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "own", 0, [user.id]);
    await setAutoNumberingForUser(user.id, occ.id, true);

    await disableAutoNumberingForUser(user.id, occ.id);
    expect(await readAutoNumbering(occ.id)).toBe(false);
  });

  test("is a no-op for an occurrence the user does not own", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const occ = await createOccurrenceRow(owner.id, "owner's", 0, [owner.id]);
    await setAutoNumberingForUser(owner.id, occ.id, true);

    await disableAutoNumberingForUser(other.id, occ.id);
    expect(await readAutoNumbering(occ.id)).toBe(true);
  });
});
