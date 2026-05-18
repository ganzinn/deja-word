import { describe, expect, test } from "vitest";

import { listOccurrencesForUser } from "@/lib/occurrences-list";
import { setPresetForUser } from "@/lib/occurrence-preset-settings";
import { SYSTEM_USER_ID } from "@/lib/system-user";

import {
  SYSTEM_OCCURRENCE_LOCATIONS,
  createOccurrenceRow,
  createTestUser,
} from "../../tests/setup/fixtures";

describe("listOccurrencesForUser", () => {
  test("returns own + system occurrences with isPreset reflecting the record", async () => {
    const user = await createTestUser();
    const own = await createOccurrenceRow(user.id, "自分のもの", 0, [user.id]);

    const items = await listOccurrencesForUser(user.id);
    const sys0 = items.find((i) => i.location === SYSTEM_OCCURRENCE_LOCATIONS[0]);
    const sys1 = items.find((i) => i.location === SYSTEM_OCCURRENCE_LOCATIONS[1]);
    const ownItem = items.find((i) => i.id === own.id);

    expect(sys0).toBeDefined();
    expect(sys0!.isSystem).toBe(true);
    expect(sys0!.isPreset).toBe(true);
    expect(sys1!.isPreset).toBe(true);

    expect(ownItem).toBeDefined();
    expect(ownItem!.isSystem).toBe(false);
    expect(ownItem!.isPreset).toBe(true);
  });

  test("isPreset becomes false after OFF, and turns back true after ON", async () => {
    const user = await createTestUser();
    const sys = (await listOccurrencesForUser(user.id)).find((i) => i.isSystem)!;
    await setPresetForUser(user.id, sys.id, false);
    const after = (await listOccurrencesForUser(user.id)).find((i) => i.id === sys.id);
    expect(after!.isPreset).toBe(false);

    await setPresetForUser(user.id, sys.id, true);
    const restored = (await listOccurrencesForUser(user.id)).find((i) => i.id === sys.id);
    expect(restored!.isPreset).toBe(true);
  });

  test("new system occurrence appears in list with isPreset=false for existing users", async () => {
    const existing = await createTestUser();
    const newSys = await createOccurrenceRow(SYSTEM_USER_ID, "後から追加", 99);
    const items = await listOccurrencesForUser(existing.id);
    const target = items.find((i) => i.id === newSys.id);
    expect(target).toBeDefined();
    expect(target!.isPreset).toBe(false);
  });

  test("does not include other users' own occurrences", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await createOccurrenceRow(b.id, "B's", 0, [b.id]);
    const items = await listOccurrencesForUser(a.id);
    expect(items.map((i) => i.location)).not.toContain("B's");
  });
});
