import { describe, expect, it } from "vitest";
import { createIssueSchema, updateIssueSchema } from "./issueSchemas";

const validIssue = {
  title: "Checkout fails after applying a discount",
  description: "The request remains pending after a valid code is applied.",
  priority: "HIGH",
  kind: "BUG",
  assigneeId: null,
  dueDate: "2026-07-29",
  estimate: 5,
  projectId: "project-1",
  cycleId: "cycle-30",
  labelIds: ["label-customer", "label-backend"],
} as const;

describe("createIssueSchema", () => {
  it("accepts a fully planned issue", () => {
    const result = createIssueSchema.safeParse(validIssue);

    expect(result.success).toBe(true);
  });

  it("normalizes repeated label IDs", () => {
    const result = createIssueSchema.parse({
      ...validIssue,
      labelIds: ["label-customer", "label-customer"],
    });

    expect(result.labelIds).toEqual(["label-customer"]);
  });

  it.each([
    ["invalid calendar date", { dueDate: "2026-02-30" }],
    ["unsupported estimate", { estimate: 4 }],
    ["empty cycle ID", { cycleId: "" }],
    ["empty assignee ID", { assigneeId: "" }],
    ["empty project ID", { projectId: "" }],
    ["short description", { description: "Too short" }],
  ])("rejects %s", (_, change) => {
    const result = createIssueSchema.safeParse({
      ...validIssue,
      ...change,
    });

    expect(result.success).toBe(false);
  });

  it("rejects fields outside the public API contract", () => {
    const result = createIssueSchema.safeParse({
      ...validIssue,
      sequence: 7,
    });

    expect(result.success).toBe(false);
  });

  it("accepts an initial status for inline board creation", () => {
    const result = createIssueSchema.safeParse({
      ...validIssue,
      status: "IN_PROGRESS",
    });

    expect(result.success).toBe(true);
  });
});

describe("updateIssueSchema", () => {
  it("accepts clearing optional planning fields", () => {
    expect(
      updateIssueSchema.safeParse({
        dueDate: null,
        estimate: null,
        cycleId: null,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(updateIssueSchema.safeParse({}).success).toBe(false);
  });
});
