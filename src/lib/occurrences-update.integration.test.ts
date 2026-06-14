import { describe, expect, test } from "vitest";

import { DuplicateOccurrenceLocationError } from "@/lib/occurrences-create";
import { OccurrenceNotFoundError, updateOccurrenceForUser } from "@/lib/occurrences-update";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createOccurrenceRow, createTestUser } from "../../tests/setup/fixtures";

describe("updateOccurrenceForUser", () => {
  test("updates location, isPreset and autoNumbering for own occurrence", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "before", 0, [user.id]);
    await updateOccurrenceForUser(user.id, occ.id, {
      location: "after",
      isPreset: true,
      autoNumbering: true,
    });
    const row = await prisma.occurrence.findUniqueOrThrow({
      where: { id: occ.id },
      select: { location: true, autoNumbering: true },
    });
    expect(row.location).toBe("after");
    expect(row.autoNumbering).toBe(true);
    const setting = await prisma.occurrencePresetSetting.findUnique({
      where: { userId_occurrenceId: { userId: user.id, occurrenceId: occ.id } },
    });
    expect(setting).not.toBeNull();
  });

  test("dropping isPreset also clears autoNumbering (preset is prerequisite)", async () => {
    const user = await createTestUser();
    const occ = await createOccurrenceRow(user.id, "linked", 0, [user.id]);
    await updateOccurrenceForUser(user.id, occ.id, {
      location: "linked",
      isPreset: true,
      autoNumbering: true,
    });
    await updateOccurrenceForUser(user.id, occ.id, {
      location: "linked",
      isPreset: false,
      autoNumbering: true,
    });
    const row = await prisma.occurrence.findUniqueOrThrow({
      where: { id: occ.id },
      select: { autoNumbering: true },
    });
    expect(row.autoNumbering).toBe(false);
  });

  test("rejects updating a system-owned occurrence from a regular user (not_found)", async () => {
    const user = await createTestUser();
    const sysOcc = await prisma.occurrence.findFirstOrThrow({
      where: { ownerId: SYSTEM_USER_ID },
      select: { id: true },
    });
    await expect(
      updateOccurrenceForUser(user.id, sysOcc.id, {
        location: "hack",
        isPreset: true,
        autoNumbering: false,
      }),
    ).rejects.toBeInstanceOf(OccurrenceNotFoundError);
  });

  test("system user can update its own occurrence", async () => {
    const occ = await createOccurrenceRow(SYSTEM_USER_ID, "sys-renamable", 0, [SYSTEM_USER_ID]);
    await updateOccurrenceForUser(SYSTEM_USER_ID, occ.id, {
      location: "sys-renamed",
      isPreset: false,
      autoNumbering: false,
    });
    const row = await prisma.occurrence.findUniqueOrThrow({
      where: { id: occ.id },
      select: { location: true },
    });
    expect(row.location).toBe("sys-renamed");
  });

  test("location uniqueness violation throws DuplicateOccurrenceLocationError", async () => {
    const user = await createTestUser();
    await createOccurrenceRow(user.id, "first", 0);
    const second = await createOccurrenceRow(user.id, "second", 1);
    await expect(
      updateOccurrenceForUser(user.id, second.id, {
        location: "first",
        isPreset: false,
        autoNumbering: false,
      }),
    ).rejects.toBeInstanceOf(DuplicateOccurrenceLocationError);
  });

  test("rejects updating to a location already owned by system user", async () => {
    const user = await createTestUser();
    const own = await createOccurrenceRow(user.id, "私の出典", 0);
    await expect(
      updateOccurrenceForUser(user.id, own.id, {
        location: "ターゲット1900",
        isPreset: false,
        autoNumbering: false,
      }),
    ).rejects.toBeInstanceOf(DuplicateOccurrenceLocationError);
    const after = await prisma.occurrence.findUniqueOrThrow({
      where: { id: own.id },
      select: { location: true },
    });
    expect(after.location).toBe("私の出典");
  });
});
