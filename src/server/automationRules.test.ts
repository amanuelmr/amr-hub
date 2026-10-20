import { describe, expect, it } from "vitest";
import {
  AUTOMATION_TEMPLATES,
  automationRuleInputSchema,
  matchesConditions,
  parseActions,
  parseConditions,
  planActions,
  renderSmartValues,
  type AutomationIssueContext,
} from "./automationRules";

const issue: AutomationIssueContext = {
  key: "ENG-7",
  title: "Checkout fails",
  kind: "BUG",
  status: "OPEN",
  priority: "MEDIUM",
  assigneeId: null,
  labelIds: ["label-a"],
  flagged: false,
  parentId: null,
  siblingStatuses: null,
  reporterMemberId: "member-reporter",
};

const values = {
  issue: { key: "ENG-7", summary: "Checkout fails" },
  initiator: "Ada",
};

describe("matchesConditions", () => {
  it("matches when there are no conditions", () => {
    expect(matchesConditions({}, issue, { trigger: "ISSUE_CREATED" })).toBe(
      true,
    );
  });

  it("filters by issue type, priority, label and empty assignee", () => {
    const event = { trigger: "ISSUE_CREATED" as const };
    expect(matchesConditions({ issueTypes: ["BUG"] }, issue, event)).toBe(true);
    expect(matchesConditions({ issueTypes: ["STORY"] }, issue, event)).toBe(
      false,
    );
    expect(matchesConditions({ priorities: ["HIGH"] }, issue, event)).toBe(
      false,
    );
    expect(
      matchesConditions({ labelIds: ["label-a", "x"] }, issue, event),
    ).toBe(true);
    expect(matchesConditions({ labelIds: ["x"] }, issue, event)).toBe(false);
    expect(matchesConditions({ assigneeEmpty: true }, issue, event)).toBe(true);
    expect(
      matchesConditions(
        { assigneeEmpty: true },
        { ...issue, assigneeId: "m1" },
        event,
      ),
    ).toBe(false);
  });

  it("checks from/to status on transitions", () => {
    const moved = { ...issue, status: "DONE" as const };
    const event = {
      trigger: "STATUS_CHANGED" as const,
      fromStatus: "IN_REVIEW" as const,
      toStatus: "DONE" as const,
    };
    expect(matchesConditions({ toStatus: "DONE" }, moved, event)).toBe(true);
    expect(matchesConditions({ fromStatus: "IN_REVIEW" }, moved, event)).toBe(
      true,
    );
    expect(matchesConditions({ fromStatus: "OPEN" }, moved, event)).toBe(false);
    expect(matchesConditions({ toStatus: "IN_PROGRESS" }, moved, event)).toBe(
      false,
    );
  });

  it("requires every sibling subtask to be done", () => {
    const event = {
      trigger: "STATUS_CHANGED" as const,
      toStatus: "DONE" as const,
    };
    const child = { ...issue, status: "DONE" as const, parentId: "ENG-1" };
    expect(
      matchesConditions(
        { allSubtasksDone: true },
        { ...child, siblingStatuses: ["DONE", "DONE"] },
        event,
      ),
    ).toBe(true);
    expect(
      matchesConditions(
        { allSubtasksDone: true },
        { ...child, siblingStatuses: ["DONE", "IN_PROGRESS"] },
        event,
      ),
    ).toBe(false);
    expect(matchesConditions({ allSubtasksDone: true }, issue, event)).toBe(
      false,
    );
  });
});

describe("renderSmartValues (legacy placeholders)", () => {
  it("substitutes known placeholders and keeps unknown ones", () => {
    expect(
      renderSmartValues(
        "{{issue.key}}: {{ issue.summary }} by {{actor}} {{nope}}",
        values,
      ),
    ).toBe("ENG-7: Checkout fails by Ada {{nope}}");
  });
});

describe("planActions", () => {
  it("builds concrete updates and skips no-op actions", () => {
    const plan = planActions(
      [
        { type: "SET_PRIORITY", priority: "HIGH" },
        { type: "SET_PRIORITY", priority: "HIGH" },
        { type: "TRANSITION", status: "OPEN" },
        { type: "ASSIGN", mode: "REPORTER" },
        { type: "ADD_LABEL", labelId: "label-a" },
        { type: "ADD_LABEL", labelId: "label-b" },
        { type: "ADD_COMMENT", body: "Hi {{actor}} re {{issue.key}}" },
        { type: "SET_FLAG", flagged: true },
      ],
      issue,
      values,
      {
        memberNames: { "member-reporter": "Rita" },
        labelNames: { "label-b": "Backend" },
      },
    );
    expect(plan.issueUpdates).toEqual({
      priority: "HIGH",
      assigneeId: "member-reporter",
      flagged: true,
    });
    expect(plan.addLabelIds).toEqual(["label-b"]);
    expect(plan.comments).toEqual(["Hi Ada re ENG-7"]);
    expect(plan.descriptions).toContain("assigned the issue to Rita");
    expect(plan.descriptions).toContain("added label Backend");
  });

  it("transitions the parent only when there is one", () => {
    const action = [
      { type: "TRANSITION_PARENT" as const, status: "DONE" as const },
    ];
    expect(planActions(action, issue, values).parentStatus).toBeNull();
    expect(
      planActions(action, { ...issue, parentId: "ENG-1" }, values).parentStatus,
    ).toBe("DONE");
  });

  it("unassigns and ignores an assign without a member", () => {
    const assigned = { ...issue, assigneeId: "m1" };
    expect(
      planActions([{ type: "ASSIGN", mode: "UNASSIGN" }], assigned, values)
        .issueUpdates,
    ).toEqual({ assigneeId: null });
    expect(
      planActions([{ type: "ASSIGN", mode: "MEMBER" }], assigned, values)
        .issueUpdates,
    ).toEqual({});
  });
});

describe("rule parsing", () => {
  it("tolerates corrupt stored JSON", () => {
    expect(parseConditions("not json")).toEqual({});
    expect(parseActions('[{"type":"BOGUS"}]')).toEqual([]);
  });

  it("ships templates that validate", () => {
    for (const template of AUTOMATION_TEMPLATES) {
      expect(automationRuleInputSchema.safeParse(template.rule).success).toBe(
        true,
      );
    }
  });
});
