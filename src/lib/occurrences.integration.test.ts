import { describe, expect, test } from "vitest";

import { getSystemOccurrencePresets } from "@/lib/occurrences";

import { SYSTEM_OCCURRENCE_LOCATIONS } from "../../tests/setup/fixtures";

describe("getSystemOccurrencePresets", () => {
  test("returns the seeded system occurrences ordered by sortOrder, then location", async () => {
    const presets = await getSystemOccurrencePresets();
    expect(presets.map((p) => p.location)).toEqual(SYSTEM_OCCURRENCE_LOCATIONS);
  });
});
