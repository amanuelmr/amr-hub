import { describe, expect, it } from "vitest";
import { createGoalSchema, createGoalUpdateSchema, linkGoalIssuesSchema, updateGoalSchema } from "./goalSchemas";

describe("goal schemas", () => {
  it("applies defaults and sanitizes the description", () => {
    const parsed = createGoalSchema.parse({ name: " Grow ", description: "<p>Hi<script>x</script></p>" });
    expect(parsed).toMatchObject({ name: "Grow", status: "PENDING", ownerId: null, targetDate: null, parentId: null });
    expect(parsed.description).toBe("<p>Hi</p>");
  });

  it("rejects blank names, invalid dates and unknown statuses", () => {
    expect(createGoalSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createGoalSchema.safeParse({ name: "x", targetDate: "2026-02-30" }).success).toBe(false);
    expect(createGoalUpdateSchema.safeParse({ status: "GREEN", body: "x" }).success).toBe(false);
    expect(createGoalUpdateSchema.safeParse({ status: "AT_RISK", body: " " }).success).toBe(false);
  });

  it("requires at least one field on update and dedupes linked ids", () => {
    expect(updateGoalSchema.safeParse({}).success).toBe(false);
    expect(updateGoalSchema.safeParse({ targetDate: null }).success).toBe(true);
    expect(linkGoalIssuesSchema.parse({ issueIds: ["A-1", "A-1", "B-2"] }).issueIds).toEqual(["A-1", "B-2"]);
  });
});
