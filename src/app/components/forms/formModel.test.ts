import { describe, expect, it } from "vitest";
import {
  addableFieldKinds,
  cleanFieldsForSave,
  createField,
  isAnswerEmpty,
  normalizeFormFields,
  validateFormFields,
} from "./formModel";

describe("normalizeFormFields", () => {
  it("keeps Summary first and required, and drops duplicate singletons", () => {
    const fields = normalizeFormFields([
      createField("SHORT_TEXT", "a"),
      { ...createField("SUMMARY", "summary"), required: false },
      createField("PRIORITY", "p1"),
      createField("PRIORITY", "p2"),
    ]);
    expect(fields.map((field) => field.id)).toEqual(["summary", "a", "p1"]);
    expect(fields[0].required).toBe(true);
  });

  it("adds a Summary when missing", () => {
    expect(normalizeFormFields([createField("DATE", "d")])[0].kind).toBe("SUMMARY");
  });
});

describe("addableFieldKinds", () => {
  it("hides singletons already on the form", () => {
    const kinds = addableFieldKinds([createField("SUMMARY", "s"), createField("DESCRIPTION", "d")]);
    expect(kinds).not.toContain("SUMMARY");
    expect(kinds).not.toContain("DESCRIPTION");
    expect(kinds).toContain("PRIORITY");
    expect(kinds).toContain("SHORT_TEXT");
  });
});

describe("cleanFieldsForSave + validateFormFields", () => {
  it("trims options and reports missing/duplicate options", () => {
    const cleaned = cleanFieldsForSave([
      createField("SUMMARY", "s"),
      { ...createField("DROPDOWN", "d"), options: [" A ", "", "B"] },
    ]);
    expect(cleaned[1].options).toEqual(["A", "B"]);
    expect(validateFormFields(cleaned)).toBeNull();
    expect(
      validateFormFields([{ ...createField("CHECKBOX", "c"), options: ["x", "X"] }]),
    ).toMatch(/duplicate/);
    expect(validateFormFields([{ ...createField("CHECKBOX", "c"), options: [] }])).toMatch(
      /at least one option/,
    );
  });
});

describe("isAnswerEmpty", () => {
  it("treats blank strings, empty rich text and empty arrays as empty", () => {
    expect(isAnswerEmpty(undefined)).toBe(true);
    expect(isAnswerEmpty("  ")).toBe(true);
    expect(isAnswerEmpty("<p></p>")).toBe(true);
    expect(isAnswerEmpty([])).toBe(true);
    expect(isAnswerEmpty(["a"])).toBe(false);
    expect(isAnswerEmpty("x")).toBe(false);
  });
});
