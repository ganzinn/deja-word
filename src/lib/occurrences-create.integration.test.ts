import { describe, expect, test } from "vitest";

import {
  DuplicateOccurrenceLocationError,
  createOccurrenceForUser,
} from "@/lib/occurrences-create";
import { prisma } from "@/lib/prisma";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import { createTestUser } from "../../tests/setup/fixtures";

describe("createOccurrenceForUser", () => {
  test("creates occurrence and preset record when isPreset=true (regular user)", async () => {
    const user = await createTestUser();
    const { id } = await createOccurrenceForUser(user.id, {
      location: "新規",
      isPreset: true,
      autoNumbering: false,
    });
    const occ = await prisma.occurrence.findUnique({
      where: { id },
      select: { id: true, ownerId: true, location: true },
    });
    const setting = await prisma.occurrencePresetSetting.findUnique({
      where: { userId_occurrenceId: { userId: user.id, occurrenceId: id } },
    });
    expect(occ).toMatchObject({ ownerId: user.id, location: "新規" });
    expect(setting).not.toBeNull();
  });

  test("persists autoNumbering flag when isPreset=true", async () => {
    const user = await createTestUser();
    const { id } = await createOccurrenceForUser(user.id, {
      location: "自動採番",
      isPreset: true,
      autoNumbering: true,
    });
    const occ = await prisma.occurrence.findUnique({
      where: { id },
      select: { autoNumbering: true },
    });
    expect(occ?.autoNumbering).toBe(true);
  });

  test("forces autoNumbering false when isPreset=false (preset is prerequisite)", async () => {
    const user = await createTestUser();
    const { id } = await createOccurrenceForUser(user.id, {
      location: "プリセットなし自動採番",
      isPreset: false,
      autoNumbering: true,
    });
    const occ = await prisma.occurrence.findUnique({
      where: { id },
      select: { autoNumbering: true },
    });
    expect(occ?.autoNumbering).toBe(false);
  });

  test("does not create preset record when isPreset=false", async () => {
    const user = await createTestUser();
    const { id } = await createOccurrenceForUser(user.id, {
      location: "ON しない",
      isPreset: false,
      autoNumbering: false,
    });
    const setting = await prisma.occurrencePresetSetting.findUnique({
      where: { userId_occurrenceId: { userId: user.id, occurrenceId: id } },
    });
    expect(setting).toBeNull();
  });

  test("trims location", async () => {
    const user = await createTestUser();
    const { id } = await createOccurrenceForUser(user.id, {
      location: "  trim me  ",
      isPreset: false,
      autoNumbering: false,
    });
    const occ = await prisma.occurrence.findUnique({ where: { id }, select: { location: true } });
    expect(occ?.location).toBe("trim me");
  });

  test("system user creating an occurrence does NOT bulk-insert settings for other users", async () => {
    const otherUser = await createTestUser();
    const beforeOther = await prisma.occurrencePresetSetting.count({
      where: { userId: otherUser.id },
    });
    const { id } = await createOccurrenceForUser(SYSTEM_USER_ID, {
      location: "system 新規",
      isPreset: true,
      autoNumbering: false,
    });
    const afterOther = await prisma.occurrencePresetSetting.count({
      where: { userId: otherUser.id },
    });
    expect(afterOther).toBe(beforeOther);
    const otherSetting = await prisma.occurrencePresetSetting.findUnique({
      where: { userId_occurrenceId: { userId: otherUser.id, occurrenceId: id } },
    });
    expect(otherSetting).toBeNull();
    const systemSetting = await prisma.occurrencePresetSetting.findUnique({
      where: { userId_occurrenceId: { userId: SYSTEM_USER_ID, occurrenceId: id } },
    });
    expect(systemSetting).not.toBeNull();
  });

  test("rejects duplicate location for the same owner", async () => {
    const user = await createTestUser();
    await createOccurrenceForUser(user.id, {
      location: "dup",
      isPreset: false,
      autoNumbering: false,
    });
    await expect(
      createOccurrenceForUser(user.id, { location: "dup", isPreset: false, autoNumbering: false }),
    ).rejects.toBeInstanceOf(DuplicateOccurrenceLocationError);
  });

  test("allows the same location across different owners", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await createOccurrenceForUser(a.id, {
      location: "shared",
      isPreset: false,
      autoNumbering: false,
    });
    await expect(
      createOccurrenceForUser(b.id, { location: "shared", isPreset: false, autoNumbering: false }),
    ).resolves.toMatchObject({ id: expect.any(String) });
  });

  test("rejects duplicate when system user already owns the location", async () => {
    const user = await createTestUser();
    await expect(
      createOccurrenceForUser(user.id, {
        location: "ターゲット1900",
        isPreset: false,
        autoNumbering: false,
      }),
    ).rejects.toBeInstanceOf(DuplicateOccurrenceLocationError);
    const own = await prisma.occurrence.findFirst({
      where: { ownerId: user.id, location: "ターゲット1900" },
    });
    expect(own).toBeNull();
  });
});
