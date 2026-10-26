import { describe, expect, it } from "vitest";
import { draftLabel, parseHiddenCreateFields } from "./createFields";

describe("parseHiddenCreateFields", () => {
  it("keeps known field keys only", () => {
    expect(parseHiddenCreateFields(null)).toEqual([]);
    expect(parseHiddenCreateFields("not json")).toEqual([]);
    expect(parseHiddenCreateFields('{"a":1}')).toEqual([]);
    expect(parseHiddenCreateFields('["labels","summary","sprint",3]')).toEqual(["labels", "sprint"]);
  });
});

describe("draftLabel", () => {
  it("uses the summary or a placeholder", () => {
    expect(draftLabel({ title: "  Fix login  " })).toBe("Fix login");
    expect(draftLabel({ title: "   " })).toBe("Untitled work item");
    expect(draftLabel(null)).toBe("Untitled work item");
  });
});
