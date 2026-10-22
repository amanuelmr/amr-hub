import { describe, expect, it } from "vitest";
import { conditionsToJql } from "./advancedFilter";

describe("conditionsToJql", () => {
  it("joins complete rows with AND and quotes values", () => {
    expect(
      conditionsToJql([
        { field: "assignee", operator: "=", value: "currentUser()" },
        { field: "status", operator: "!=", value: "In review" },
        { field: "labels", operator: "is EMPTY", value: "" },
        { field: "storypoints", operator: ">", value: "3" },
        { field: "due", operator: "<=", value: "7d" },
        { field: "summary", operator: "~", value: 'say "hi"' },
      ]),
    ).toBe(
      'assignee = currentUser() AND status != "In review" AND labels is EMPTY AND "story points" > 3 AND due <= "7d" AND summary ~ "say \\"hi\\""',
    );
  });

  it("skips rows that still need a value", () => {
    expect(conditionsToJql([{ field: "priority", operator: "=", value: " " }])).toBe("");
  });
});
