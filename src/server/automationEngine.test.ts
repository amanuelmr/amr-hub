import { describe, expect, it } from "vitest";
import {
  automationRuleInputSchema,
  automationRuleUpdateSchema,
  branchTargets,
  computeNextRunAt,
  evaluateFieldCondition,
  fieldChangeMatches,
  ifElseActions,
  matchesConditions,
  parseActions,
  planActions,
  renderSmartValues,
  resolveRelativeDate,
  triggersForEvent,
  type AutomationIssueContext,
} from "./automationRules";

const issue: AutomationIssueContext = {
  key: "WEB-12",
  title: "Login button misaligned",
  kind: "BUG",
  status: "IN_PROGRESS",
  priority: "HIGH",
  assigneeId: "m-ada",
  labelIds: ["l-ui"],
  flagged: false,
  parentId: "WEB-1",
  siblingStatuses: ["IN_PROGRESS"],
  reporterMemberId: "m-rita",
  childIds: ["WEB-13", "WEB-14"],
  fields: {
    assigneeId: ["m-ada", "Ada Lovelace", "ada@example.com"],
    labelIds: ["l-ui", "frontend"],
    dueDate: null,
    "cf:severity": "S2",
  },
};

describe("smart values", () => {
  const context = {
    issue: {
      key: "WEB-12",
      summary: "Login button misaligned",
      status: "In Progress",
      priority: "High",
      assignee: "Ada Lovelace",
      reporter: "Rita",
      url: "https://hub.test/issues/WEB-12",
      dueDate: "2026-10-20",
    },
    initiator: "Grace",
    now: new Date("2026-10-18T09:30:00Z"),
    sprint: { name: "WEB Sprint 4" },
  };

  it("renders issue, initiator, date and sprint values", () => {
    expect(
      renderSmartValues(
        "{{issue.key}} {{issue.summary}} [{{issue.status}}/{{issue.priority}}] " +
          "{{issue.assignee}} {{issue.reporter}} {{issue.url}} {{issue.dueDate}} " +
          "{{initiator}} {{actor}} {{now}} {{sprint.name}}",
        context,
      ),
    ).toBe(
      "WEB-12 Login button misaligned [In Progress/High] Ada Lovelace Rita " +
        "https://hub.test/issues/WEB-12 2026-10-20 Grace Grace " +
        "2026-10-18T09:30:00.000Z WEB Sprint 4",
    );
  });

  it("renders known values with no data as empty and keeps unknown names", () => {
    expect(
      renderSmartValues("[{{version.name}}] {{issue.whatever}}", {
        initiator: "Grace",
      }),
    ).toBe("[] {{issue.whatever}}");
  });
});

describe("relative dates", () => {
  const now = new Date("2026-10-18T22:00:00Z");
  it("resolves offsets, absolute dates and clears", () => {
    expect(resolveRelativeDate("+3d", now)).toBe("2026-10-21");
    expect(resolveRelativeDate("-1w", now)).toBe("2026-10-11");
    expect(resolveRelativeDate("+1m", now)).toBe("2026-11-18");
    expect(resolveRelativeDate("today", now)).toBe("2026-10-18");
    expect(resolveRelativeDate("2027-01-05", now)).toBe("2027-01-05");
    expect(resolveRelativeDate("", now)).toBeNull();
    expect(resolveRelativeDate("soon", now)).toBeUndefined();
  });
});

describe("schedules", () => {
  it("computes the next hourly run", () => {
    const from = new Date("2026-10-18T10:20:00Z");
    expect(
      computeNextRunAt(
        { frequency: "HOURLY", time: "00:15" },
        from,
      ).toISOString(),
    ).toBe("2026-10-18T11:15:00.000Z");
    expect(
      computeNextRunAt(
        { frequency: "HOURLY", time: "00:45" },
        from,
      ).toISOString(),
    ).toBe("2026-10-18T10:45:00.000Z");
  });

  it("computes the next daily run, rolling over after the time passed", () => {
    expect(
      computeNextRunAt(
        { frequency: "DAILY", time: "09:00" },
        new Date("2026-10-18T08:59:00Z"),
      ).toISOString(),
    ).toBe("2026-10-18T09:00:00.000Z");
    expect(
      computeNextRunAt(
        { frequency: "DAILY", time: "09:00" },
        new Date("2026-10-18T09:00:00Z"),
      ).toISOString(),
    ).toBe("2026-10-19T09:00:00.000Z");
  });

  it("computes the next weekly run on the chosen day", () => {
    // 2026-10-18 is a Sunday.
    const from = new Date("2026-10-18T12:00:00Z");
    expect(
      computeNextRunAt(
        { frequency: "WEEKLY", time: "08:30", dayOfWeek: 1 },
        from,
      ).toISOString(),
    ).toBe("2026-10-19T08:30:00.000Z");
    expect(
      computeNextRunAt(
        { frequency: "WEEKLY", time: "08:30", dayOfWeek: 0 },
        from,
      ).toISOString(),
    ).toBe("2026-10-25T08:30:00.000Z");
    expect(
      computeNextRunAt(
        { frequency: "WEEKLY", time: "13:00", dayOfWeek: 0 },
        from,
      ).toISOString(),
    ).toBe("2026-10-18T13:00:00.000Z");
  });
});

describe("event triggers", () => {
  it("fans issue updates out to field-changed and assigned rules", () => {
    expect(triggersForEvent({ trigger: "ISSUE_CREATED" })).toEqual([
      "ISSUE_CREATED",
    ]);
    expect(
      triggersForEvent({
        trigger: "ISSUE_UPDATED",
        changedFields: ["assigneeId"],
      }),
    ).toEqual(["ISSUE_UPDATED", "FIELD_CHANGED", "ISSUE_ASSIGNED"]);
    expect(triggersForEvent({ trigger: "STATUS_CHANGED" })).toEqual([
      "STATUS_CHANGED",
      "FIELD_CHANGED",
    ]);
  });

  it("matches watched fields by alias and custom fields", () => {
    expect(fieldChangeMatches(["priority"], ["priority", "title"])).toBe(true);
    expect(fieldChangeMatches(["summary"], ["title"])).toBe(true);
    expect(fieldChangeMatches(["sprint"], ["cycleId"])).toBe(true);
    expect(fieldChangeMatches(["priority"], ["title"])).toBe(false);
    expect(fieldChangeMatches(["cf:severity"], ["customFields"])).toBe(true);
    expect(fieldChangeMatches([], ["description"])).toBe(true);
    expect(fieldChangeMatches(undefined, [])).toBe(false);
  });
});

describe("advanced conditions", () => {
  const event = { trigger: "ISSUE_UPDATED" as const };

  it("evaluates field operators case-insensitively", () => {
    expect(evaluateFieldCondition("High", "EQUALS", "high")).toBe(true);
    expect(evaluateFieldCondition(["a", "b"], "NOT_EQUALS", "c")).toBe(true);
    expect(evaluateFieldCondition("Checkout fails", "CONTAINS", "out")).toBe(
      true,
    );
    expect(evaluateFieldCondition(null, "IS_EMPTY")).toBe(true);
    expect(evaluateFieldCondition([], "IS_NOT_EMPTY")).toBe(false);
  });

  it("checks issue fields by name, id, alias and custom field", () => {
    const check = (
      field: string,
      operator: "EQUALS" | "IS_EMPTY",
      value?: string,
    ) =>
      matchesConditions(
        { checks: [{ type: "FIELD", field, operator, value }] },
        issue,
        event,
      );
    expect(check("assignee", "EQUALS", "ada lovelace")).toBe(true);
    expect(check("assigneeId", "EQUALS", "m-ada")).toBe(true);
    expect(check("labels", "EQUALS", "frontend")).toBe(true);
    expect(check("priority", "EQUALS", "HIGH")).toBe(true);
    expect(check("dueDate", "IS_EMPTY")).toBe(true);
    expect(check("cf:severity", "EQUALS", "s2")).toBe(true);
    expect(check("severity", "EQUALS", "s2")).toBe(true);
    expect(check("priority", "EQUALS", "LOW")).toBe(false);
  });

  it("uses the JQL evaluator and fails closed without one", () => {
    const conditions = {
      checks: [{ type: "JQL" as const, jql: "priority = High" }],
    };
    expect(matchesConditions(conditions, issue, event)).toBe(false);
    expect(
      matchesConditions(conditions, issue, event, { jql: () => true }),
    ).toBe(true);
  });

  it("checks the initiator's role and identity", () => {
    const env = {
      initiatorMemberId: "m-grace",
      memberRoles: { "m-grace": "viewer", "m-ada": "member" },
    };
    const role = (operator: "IN_ROLE" | "NOT_IN_ROLE") =>
      matchesConditions(
        {
          checks: [
            {
              type: "USER",
              subject: "INITIATOR",
              operator,
              roles: ["owner", "member"],
            },
          ],
        },
        issue,
        event,
        env,
      );
    expect(role("IN_ROLE")).toBe(false);
    expect(role("NOT_IN_ROLE")).toBe(true);
    expect(
      matchesConditions(
        {
          checks: [
            {
              type: "USER",
              subject: "ASSIGNEE",
              operator: "IS",
              memberIds: ["m-ada"],
            },
          ],
        },
        issue,
        event,
        env,
      ),
    ).toBe(true);
  });
});

describe("branching and if/else", () => {
  it("resolves subtasks, parent and JQL branches", () => {
    expect(branchTargets("SUBTASKS", issue)).toEqual(["WEB-13", "WEB-14"]);
    expect(branchTargets("PARENT", issue)).toEqual(["WEB-1"]);
    expect(branchTargets("PARENT", { ...issue, parentId: null })).toEqual([]);
    expect(branchTargets("JQL", issue, ["WEB-12", "WEB-20"])).toEqual([
      "WEB-20",
    ]);
    expect(branchTargets("JQL", null, ["WEB-20"])).toEqual(["WEB-20"]);
  });

  it("picks then or else actions", () => {
    const [block] = parseActions(
      JSON.stringify([
        {
          type: "IF_ELSE",
          conditions: { priorities: ["HIGH"] },
          then: [{ type: "SET_FLAG", flagged: true }],
          else: [{ type: "ADD_COMMENT", body: "fine" }],
        },
      ]),
    );
    if (block.type !== "IF_ELSE") throw new Error("expected if/else");
    expect(ifElseActions(block, true)).toEqual([
      { type: "SET_FLAG", flagged: true },
    ]);
    expect(ifElseActions(block, false)).toEqual([
      { type: "ADD_COMMENT", body: "fine" },
    ]);
  });

  it("rejects nested branches (one level only)", () => {
    expect(
      parseActions(
        JSON.stringify([
          {
            type: "BRANCH",
            scope: "SUBTASKS",
            actions: [{ type: "BRANCH", scope: "PARENT", actions: [] }],
          },
        ]),
      ),
    ).toEqual([]);
  });
});

describe("edit issue fields", () => {
  it("plans field edits with relative due dates and label modes", () => {
    const plan = planActions(
      [
        {
          type: "EDIT_FIELDS",
          priority: "URGENT",
          dueDate: "+3d",
          estimate: 5,
          teamId: "team-1",
          summary: "[{{issue.key}}] {{issue.summary}}",
          labels: { mode: "SET", labelIds: ["l-backend"] },
          assignee: { mode: "INITIATOR" },
        },
      ],
      issue,
      { issue: { key: "WEB-12", summary: "Login" }, initiator: "Grace" },
      { initiatorMemberId: "m-grace", now: new Date("2026-10-18T10:00:00Z") },
    );
    expect(plan.issueUpdates).toEqual({
      priority: "URGENT",
      dueDate: "2026-10-21",
      estimate: 5,
      teamId: "team-1",
      title: "[WEB-12] Login",
      assigneeId: "m-grace",
    });
    expect(plan.addLabelIds).toEqual(["l-backend"]);
    expect(plan.removeLabelIds).toEqual(["l-ui"]);
  });

  it("removes labels and ignores no-op label edits", () => {
    const plan = planActions(
      [
        {
          type: "EDIT_FIELDS",
          labels: { mode: "REMOVE", labelIds: ["l-ui", "nope"] },
        },
        { type: "EDIT_FIELDS", labels: { mode: "ADD", labelIds: ["l-ui"] } },
      ],
      issue,
      { initiator: "Grace" },
    );
    expect(plan.addLabelIds).toEqual([]);
    expect(plan.removeLabelIds).toEqual([]);
  });
});

describe("rule validation", () => {
  it("requires a schedule for scheduled rules", () => {
    const rule = {
      name: "Nightly",
      trigger: "SCHEDULED",
      actions: [{ type: "SET_FLAG", flagged: true }],
    };
    expect(automationRuleInputSchema.safeParse(rule).success).toBe(false);
    expect(
      automationRuleInputSchema.safeParse({
        ...rule,
        schedule: { frequency: "DAILY", time: "07:00", jql: "duedate < now()" },
      }).success,
    ).toBe(true);
    expect(
      automationRuleInputSchema.safeParse({
        ...rule,
        schedule: { frequency: "DAILY", time: "25:00" },
      }).success,
    ).toBe(false);
  });

  it("validates new action and condition shapes", () => {
    expect(
      automationRuleInputSchema.safeParse({
        name: "Everything",
        trigger: "FIELD_CHANGED",
        conditions: {
          fields: ["priority", "cf:abc"],
          checks: [
            {
              type: "FIELD",
              field: "summary",
              operator: "CONTAINS",
              value: "x",
            },
            { type: "JQL", jql: "type = Bug" },
            { type: "USER", operator: "IN_ROLE", roles: ["owner"] },
          ],
        },
        actions: [
          {
            type: "CREATE_ISSUE",
            kind: "TASK",
            summary: "Follow up {{issue.key}}",
            parent: "NONE",
          },
          { type: "CREATE_SUBTASKS", summaries: ["A", "B"] },
          { type: "CLONE_ISSUE" },
          {
            type: "LINK_ISSUES",
            linkType: "RELATES_TO",
            target: "{{issue.parent.key}}",
          },
          { type: "NOTIFY", recipients: ["WATCHERS"], message: "Hi" },
          {
            type: "BRANCH",
            scope: "SUBTASKS",
            actions: [{ type: "TRANSITION", status: "DONE" }],
          },
        ],
      }).success,
    ).toBe(true);
    expect(automationRuleUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("templates", () => {
  it("ship at least eight valid templates whose JQL parses", async () => {
    const { AUTOMATION_TEMPLATES } = await import("./automationRules");
    const { parseJql } = await import("../app/data/jql");
    expect(AUTOMATION_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    for (const template of AUTOMATION_TEMPLATES) {
      expect(automationRuleInputSchema.safeParse(template.rule).success).toBe(
        true,
      );
      const queries = [
        template.rule.schedule?.jql,
        ...(template.rule.conditions?.checks ?? []).map((check) =>
          check.type === "JQL" ? check.jql : undefined,
        ),
      ].filter((query): query is string => Boolean(query));
      for (const query of queries) expect(parseJql(query).ok).toBe(true);
    }
  });
});
