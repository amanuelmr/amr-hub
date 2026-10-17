import { describe, expect, it } from "vitest";
import {
  createSavedViewSchema,
  jqlFilterSchema,
  savedViewSchema,
  updateSavedViewSchema,
} from "./savedViewSchemas";

const validView = {
  name: "Urgent customer work",
  query: "checkout",
  status: "ACTIVE",
  priority: "URGENT",
  assignee: "Amanuel R.",
  sort: "NEWEST",
  labelId: "label-customer",
} as const;

describe("savedViewSchema", () => {
  it("accepts a reusable issue filter", () => {
    expect(savedViewSchema.safeParse(validView).success).toBe(true);
  });

  it.each([
    ["unknown status", { status: "BLOCKED" }],
    ["unknown sort order", { sort: "POPULAR" }],
    ["empty owner", { assignee: "" }],
    ["name over 50 characters", { name: "a".repeat(51) }],
  ])("rejects %s", (_, change) => {
    expect(
      savedViewSchema.safeParse({ ...validView, ...change }).success,
    ).toBe(false);
  });
});

describe("saved view JQL", () => {
  it("accepts a valid JQL filter", () => {
    expect(
      createSavedViewSchema.safeParse({
        name: "My open work",
        jql: "assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC",
      }).success,
    ).toBe(true);
    expect(
      savedViewSchema.safeParse({ ...validView, jql: "project = AMR" }).success,
    ).toBe(true);
  });

  it("rejects invalid JQL with a positioned message", () => {
    const result = jqlFilterSchema.safeParse({ name: "Broken", jql: "status = " });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].message).toContain("at character 9");
  });

  it("requires a field on update", () => {
    expect(updateSavedViewSchema.safeParse({}).success).toBe(false);
    expect(updateSavedViewSchema.safeParse({ name: "Renamed" }).success).toBe(true);
  });
});
