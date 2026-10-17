import { describe, expect, it } from "vitest";
import { bulkIssueSchema, nextLabelIds } from "./bulkIssueSchemas";

describe("bulkIssueSchema", () => {
  it("accepts each operation with its value type", () => {
    const ids = ["AMR-1", "AMR-2"];
    expect(bulkIssueSchema.safeParse({ issueIds: ids, operation: "transition", value: "DONE" }).success).toBe(true);
    expect(bulkIssueSchema.safeParse({ issueIds: ids, operation: "assign", value: null }).success).toBe(true);
    expect(bulkIssueSchema.safeParse({ issueIds: ids, operation: "priority", value: "HIGH" }).success).toBe(true);
    expect(bulkIssueSchema.safeParse({ issueIds: ids, operation: "addLabels", value: ["l1"] }).success).toBe(true);
    expect(bulkIssueSchema.safeParse({ issueIds: ids, operation: "sprint", value: "c1" }).success).toBe(true);
    expect(bulkIssueSchema.safeParse({ issueIds: ids, operation: "flag", value: true }).success).toBe(true);
    expect(bulkIssueSchema.safeParse({ issueIds: ids, operation: "delete" }).success).toBe(true);
  });

  it("rejects bad payloads", () => {
    expect(bulkIssueSchema.safeParse({ issueIds: [], operation: "delete" }).success).toBe(false);
    expect(
      bulkIssueSchema.safeParse({
        issueIds: Array.from({ length: 201 }, (_, index) => `AMR-${index}`),
        operation: "delete",
      }).success,
    ).toBe(false);
    expect(bulkIssueSchema.safeParse({ issueIds: ["A-1"], operation: "transition", value: "NOPE" }).success).toBe(false);
    expect(bulkIssueSchema.safeParse({ issueIds: ["A-1"], operation: "flag", value: "yes" }).success).toBe(false);
    expect(bulkIssueSchema.safeParse({ issueIds: ["A-1"], operation: "explode" }).success).toBe(false);
  });

  it("dedupes issue ids", () => {
    const parsed = bulkIssueSchema.parse({ issueIds: ["A-1", "A-1"], operation: "delete" });
    expect(parsed.issueIds).toEqual(["A-1"]);
  });
});

describe("nextLabelIds", () => {
  it("adds and removes labels", () => {
    expect(nextLabelIds(["a"], "addLabels", ["b"])).toEqual(["a", "b"]);
    expect(nextLabelIds(["a", "b"], "removeLabels", ["a"])).toEqual(["b"]);
  });

  it("returns null when unchanged", () => {
    expect(nextLabelIds(["a"], "addLabels", ["a"])).toBeNull();
    expect(nextLabelIds(["a"], "removeLabels", ["z"])).toBeNull();
  });
});
