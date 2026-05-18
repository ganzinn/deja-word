import { describe, expect, test } from "vitest";

import {
  defaultOccurrenceFormValues,
  occurrenceFormSchema,
  occurrenceToFormValues,
} from "@/lib/schema/occurrence-form";

describe("occurrenceFormSchema", () => {
  test("accepts a valid form", () => {
    const r = occurrenceFormSchema.safeParse({ location: "TOEIC", isPreset: true });
    expect(r.success).toBe(true);
  });

  test("rejects empty location after trim", () => {
    const r = occurrenceFormSchema.safeParse({ location: "   ", isPreset: true });
    expect(r.success).toBe(false);
  });

  test("trims location", () => {
    const r = occurrenceFormSchema.parse({ location: "  TOEIC  ", isPreset: false });
    expect(r.location).toBe("TOEIC");
    expect(r.isPreset).toBe(false);
  });

  test("requires isPreset to be a boolean", () => {
    const r = occurrenceFormSchema.safeParse({ location: "TOEIC", isPreset: "yes" });
    expect(r.success).toBe(false);
  });
});

describe("defaultOccurrenceFormValues", () => {
  test("starts with empty location and isPreset=true", () => {
    expect(defaultOccurrenceFormValues).toEqual({ location: "", isPreset: true });
  });

  test("default does not validate (empty location)", () => {
    expect(occurrenceFormSchema.safeParse(defaultOccurrenceFormValues).success).toBe(false);
  });
});

describe("occurrenceToFormValues", () => {
  test("maps location and isPreset through", () => {
    expect(occurrenceToFormValues({ location: "L", isPreset: true })).toEqual({
      location: "L",
      isPreset: true,
    });
  });
});
