import { describe, expect, test } from "vitest";

import { SHORT_TEXT_MAX_LENGTH } from "@/lib/schema/content-limits";
import {
  defaultOccurrenceFormValues,
  occurrenceFormSchema,
  occurrenceToFormValues,
} from "@/lib/schema/occurrence-form";

describe("occurrenceFormSchema", () => {
  test("accepts a valid form", () => {
    const r = occurrenceFormSchema.safeParse({
      location: "TOEIC",
      isPreset: true,
      autoNumbering: false,
    });
    expect(r.success).toBe(true);
  });

  test("rejects empty location after trim", () => {
    const r = occurrenceFormSchema.safeParse({
      location: "   ",
      isPreset: true,
      autoNumbering: false,
    });
    expect(r.success).toBe(false);
  });

  test("trims location", () => {
    const r = occurrenceFormSchema.parse({
      location: "  TOEIC  ",
      isPreset: false,
      autoNumbering: true,
    });
    expect(r.location).toBe("TOEIC");
    expect(r.isPreset).toBe(false);
    expect(r.autoNumbering).toBe(true);
  });

  test("accepts location at exactly SHORT_TEXT_MAX_LENGTH", () => {
    const r = occurrenceFormSchema.safeParse({
      location: "a".repeat(SHORT_TEXT_MAX_LENGTH),
      isPreset: true,
      autoNumbering: false,
    });
    expect(r.success).toBe(true);
  });

  test("rejects location over SHORT_TEXT_MAX_LENGTH", () => {
    const r = occurrenceFormSchema.safeParse({
      location: "a".repeat(SHORT_TEXT_MAX_LENGTH + 1),
      isPreset: true,
      autoNumbering: false,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "location")).toBe(true);
    }
  });

  test("requires isPreset to be a boolean", () => {
    const r = occurrenceFormSchema.safeParse({
      location: "TOEIC",
      isPreset: "yes",
      autoNumbering: false,
    });
    expect(r.success).toBe(false);
  });

  test("requires autoNumbering to be a boolean", () => {
    const r = occurrenceFormSchema.safeParse({
      location: "TOEIC",
      isPreset: true,
      autoNumbering: "yes",
    });
    expect(r.success).toBe(false);
  });
});

describe("defaultOccurrenceFormValues", () => {
  test("starts with empty location, isPreset=true, autoNumbering=false", () => {
    expect(defaultOccurrenceFormValues).toEqual({
      location: "",
      isPreset: true,
      autoNumbering: false,
    });
  });

  test("default does not validate (empty location)", () => {
    expect(occurrenceFormSchema.safeParse(defaultOccurrenceFormValues).success).toBe(false);
  });
});

describe("occurrenceToFormValues", () => {
  test("maps location, isPreset and autoNumbering through", () => {
    expect(occurrenceToFormValues({ location: "L", isPreset: true, autoNumbering: true })).toEqual({
      location: "L",
      isPreset: true,
      autoNumbering: true,
    });
  });
});
