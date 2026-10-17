import { z } from "zod";
import {
  PRIORITY_LABELS,
  type IssueKind,
  type IssuePriority,
  type IssueStatus,
} from "../app/data/issues";
import {
  isDoneStatus,
  isValidStatusKey,
  isValidTypeKey,
  statusName,
  typeName,
  type ProjectWorkflow,
} from "../app/data/workflow";

/** Optional project config used to name custom statuses/types. */
type WorkflowNames = Partial<Pick<ProjectWorkflow, "statuses" | "types">>;

export const AUTOMATION_TRIGGERS = [
  "ISSUE_CREATED",
  "STATUS_CHANGED",
  "ISSUE_UPDATED",
  "COMMENT_ADDED",
] as const;

export type AutomationTriggerType = (typeof AUTOMATION_TRIGGERS)[number];

export const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  ISSUE_CREATED: "Issue created",
  STATUS_CHANGED: "Issue transitioned",
  ISSUE_UPDATED: "Issue updated",
  COMMENT_ADDED: "Comment added",
};

const statusSchema = z
  .string()
  .trim()
  .max(80)
  .refine(isValidStatusKey, { message: "Unknown status" });
const kindSchema = z
  .string()
  .trim()
  .max(80)
  .refine(isValidTypeKey, { message: "Unknown work type" });
const prioritySchema = z.enum([
  "NO_PRIORITY",
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);

export const automationConditionsSchema = z
  .object({
    fromStatus: statusSchema.nullable().optional(),
    toStatus: statusSchema.nullable().optional(),
    issueTypes: z.array(kindSchema).max(5).optional(),
    priorities: z.array(prioritySchema).max(5).optional(),
    labelIds: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    assigneeEmpty: z.boolean().optional(),
    allSubtasksDone: z.boolean().optional(),
  })
  .strict();

export type AutomationConditions = z.infer<typeof automationConditionsSchema>;

export const automationActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ASSIGN"),
      mode: z.enum(["MEMBER", "REPORTER", "UNASSIGN"]),
      memberId: z.string().trim().min(1).max(120).nullable().optional(),
    })
    .strict(),
  z.object({ type: z.literal("TRANSITION"), status: statusSchema }).strict(),
  z
    .object({ type: z.literal("TRANSITION_PARENT"), status: statusSchema })
    .strict(),
  z
    .object({ type: z.literal("SET_PRIORITY"), priority: prioritySchema })
    .strict(),
  z
    .object({
      type: z.literal("ADD_LABEL"),
      labelId: z.string().trim().min(1).max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal("ADD_COMMENT"),
      body: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z.object({ type: z.literal("SET_FLAG"), flagged: z.boolean() }).strict(),
]);

export type AutomationAction = z.infer<typeof automationActionSchema>;
export type AutomationActionType = AutomationAction["type"];

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  ASSIGN: "Assign issue",
  TRANSITION: "Transition issue",
  TRANSITION_PARENT: "Transition parent issue",
  SET_PRIORITY: "Set priority",
  ADD_LABEL: "Add label",
  ADD_COMMENT: "Add comment",
  SET_FLAG: "Flag / unflag issue",
};

export const automationRuleInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    enabled: z.boolean().default(true),
    trigger: z.enum(AUTOMATION_TRIGGERS),
    conditions: automationConditionsSchema.default({}),
    actions: z.array(automationActionSchema).min(1).max(10),
  })
  .strict();

export const automationRuleUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    enabled: z.boolean().optional(),
    trigger: z.enum(AUTOMATION_TRIGGERS).optional(),
    conditions: automationConditionsSchema.optional(),
    actions: z.array(automationActionSchema).min(1).max(10).optional(),
  })
  .strict()
  .refine((updates) => Object.keys(updates).length > 0, {
    message: "Provide at least one rule field to update",
  });

export type AutomationRuleInput = z.infer<typeof automationRuleInputSchema>;

export type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTriggerType;
  conditions: AutomationConditions;
  actions: AutomationAction[];
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
};

export function parseConditions(raw: string | null | undefined) {
  try {
    const parsed = automationConditionsSchema.safeParse(
      JSON.parse(raw ?? "{}"),
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function parseActions(raw: string | null | undefined) {
  try {
    const parsed = z
      .array(automationActionSchema)
      .safeParse(JSON.parse(raw ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** The issue facts automation conditions and actions are evaluated against. */
export type AutomationIssueContext = {
  key: string;
  title: string;
  kind: IssueKind;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  labelIds: string[];
  flagged: boolean;
  parentId: string | null;
  /** Statuses of every child of this issue's parent (including itself). */
  siblingStatuses: IssueStatus[] | null;
  /** The member id of the reporter, when the reporter is still a member. */
  reporterMemberId: string | null;
};

export type AutomationEventContext = {
  trigger: AutomationTriggerType;
  fromStatus?: IssueStatus;
  toStatus?: IssueStatus;
};

export function matchesConditions(
  conditions: AutomationConditions,
  issue: AutomationIssueContext,
  event: AutomationEventContext,
) {
  if (event.trigger === "STATUS_CHANGED") {
    if (conditions.fromStatus && event.fromStatus !== conditions.fromStatus) {
      return false;
    }
    if (conditions.toStatus && issue.status !== conditions.toStatus) {
      return false;
    }
  }

  if (
    conditions.issueTypes?.length &&
    !conditions.issueTypes.includes(issue.kind)
  ) {
    return false;
  }

  if (
    conditions.priorities?.length &&
    !conditions.priorities.includes(issue.priority)
  ) {
    return false;
  }

  if (
    conditions.labelIds?.length &&
    !conditions.labelIds.some((labelId) => issue.labelIds.includes(labelId))
  ) {
    return false;
  }

  if (conditions.assigneeEmpty && issue.assigneeId) return false;

  if (conditions.allSubtasksDone) {
    if (!issue.parentId || !issue.siblingStatuses?.length) return false;
    if (!issue.siblingStatuses.every((status) => isDoneStatus(status))) {
      return false;
    }
  }

  return true;
}

export type TemplateValues = {
  issueKey: string;
  issueSummary: string;
  actor: string;
};

export function renderTemplate(template: string, values: TemplateValues) {
  const replacements: Record<string, string> = {
    "issue.key": values.issueKey,
    "issue.summary": values.issueSummary,
    actor: values.actor,
  };
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) =>
    name in replacements ? replacements[name] : match,
  );
}

/** Concrete effects computed from a rule's actions, applied by the engine. */
export type AutomationPlan = {
  issueUpdates: {
    assigneeId?: string | null;
    status?: IssueStatus;
    priority?: IssuePriority;
    flagged?: boolean;
  };
  addLabelIds: string[];
  comments: string[];
  parentStatus: IssueStatus | null;
  descriptions: string[];
};

export function planActions(
  actions: AutomationAction[],
  issue: AutomationIssueContext,
  values: TemplateValues,
  memberNames: Record<string, string> = {},
  labelNames: Record<string, string> = {},
  workflow: WorkflowNames = {},
): AutomationPlan {
  const plan: AutomationPlan = {
    issueUpdates: {},
    addLabelIds: [],
    comments: [],
    parentStatus: null,
    descriptions: [],
  };
  let current = { ...issue, labelIds: [...issue.labelIds] };

  for (const action of actions) {
    switch (action.type) {
      case "ASSIGN": {
        const next =
          action.mode === "UNASSIGN"
            ? null
            : action.mode === "REPORTER"
              ? issue.reporterMemberId
              : (action.memberId ?? null);
        if (action.mode !== "UNASSIGN" && !next) break;
        if (next === current.assigneeId) break;
        plan.issueUpdates.assigneeId = next;
        current = { ...current, assigneeId: next };
        plan.descriptions.push(
          next
            ? `assigned the issue to ${memberNames[next] ?? "a member"}`
            : "unassigned the issue",
        );
        break;
      }
      case "TRANSITION":
        if (action.status === current.status) break;
        plan.issueUpdates.status = action.status;
        current = { ...current, status: action.status };
        plan.descriptions.push(
          `changed status to ${statusName(action.status, workflow.statuses)}`,
        );
        break;
      case "TRANSITION_PARENT":
        if (!issue.parentId) break;
        plan.parentStatus = action.status;
        plan.descriptions.push(
          `transitioned parent ${issue.parentId} to ${statusName(
            action.status,
            workflow.statuses,
          )}`,
        );
        break;
      case "SET_PRIORITY":
        if (action.priority === current.priority) break;
        plan.issueUpdates.priority = action.priority;
        current = { ...current, priority: action.priority };
        plan.descriptions.push(
          `set priority to ${PRIORITY_LABELS[action.priority]}`,
        );
        break;
      case "ADD_LABEL":
        if (current.labelIds.includes(action.labelId)) break;
        plan.addLabelIds.push(action.labelId);
        current.labelIds.push(action.labelId);
        plan.descriptions.push(
          `added label ${labelNames[action.labelId] ?? action.labelId}`,
        );
        break;
      case "ADD_COMMENT":
        plan.comments.push(renderTemplate(action.body, values));
        plan.descriptions.push("added a comment");
        break;
      case "SET_FLAG":
        if (action.flagged === current.flagged) break;
        plan.issueUpdates.flagged = action.flagged;
        current = { ...current, flagged: action.flagged };
        plan.descriptions.push(
          action.flagged ? "flagged the issue" : "removed the flag",
        );
        break;
    }
  }

  return plan;
}

export function isEmptyPlan(plan: AutomationPlan) {
  return (
    Object.keys(plan.issueUpdates).length === 0 &&
    plan.addLabelIds.length === 0 &&
    plan.comments.length === 0 &&
    plan.parentStatus === null
  );
}

export function describeConditions(
  conditions: AutomationConditions,
  workflow: WorkflowNames = {},
) {
  const parts: string[] = [];
  if (conditions.fromStatus) {
    parts.push(`from ${statusName(conditions.fromStatus, workflow.statuses)}`);
  }
  if (conditions.toStatus) {
    parts.push(`to ${statusName(conditions.toStatus, workflow.statuses)}`);
  }
  if (conditions.issueTypes?.length) {
    parts.push(
      `type is ${conditions.issueTypes
        .map((kind) => typeName(kind, workflow.types))
        .join(" or ")}`,
    );
  }
  if (conditions.priorities?.length) {
    parts.push(
      `priority is ${conditions.priorities.map((value) => PRIORITY_LABELS[value]).join(" or ")}`,
    );
  }
  if (conditions.labelIds?.length) parts.push("has matching label");
  if (conditions.assigneeEmpty) parts.push("assignee is empty");
  if (conditions.allSubtasksDone) parts.push("all sibling subtasks are done");
  return parts;
}

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  rule: AutomationRuleInput;
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "bug-high",
    name: "When a bug is created → set priority High",
    description: "New bugs get triaged as High priority automatically.",
    rule: {
      name: "Bugs start as High priority",
      enabled: true,
      trigger: "ISSUE_CREATED",
      conditions: { issueTypes: ["BUG"] },
      actions: [{ type: "SET_PRIORITY", priority: "HIGH" }],
    },
  },
  {
    id: "subtasks-done",
    name: "When all subtasks are done → transition parent to Done",
    description: "Closes the parent as soon as its last subtask is done.",
    rule: {
      name: "Close parent when subtasks are done",
      enabled: true,
      trigger: "STATUS_CHANGED",
      conditions: { toStatus: "DONE", allSubtasksDone: true },
      actions: [{ type: "TRANSITION_PARENT", status: "DONE" }],
    },
  },
  {
    id: "assign-reporter",
    name: "When an issue is created unassigned → assign to reporter",
    description: "Every issue has an owner from the moment it exists.",
    rule: {
      name: "Assign new issues to the reporter",
      enabled: true,
      trigger: "ISSUE_CREATED",
      conditions: { assigneeEmpty: true },
      actions: [{ type: "ASSIGN", mode: "REPORTER" }],
    },
  },
  {
    id: "review-comment",
    name: "When moved to In review → add a comment",
    description: "Leave an audit trail when work is ready for review.",
    rule: {
      name: "Comment when work enters review",
      enabled: true,
      trigger: "STATUS_CHANGED",
      conditions: { toStatus: "IN_REVIEW" },
      actions: [
        {
          type: "ADD_COMMENT",
          body: "{{issue.key}} ({{issue.summary}}) is ready for review — moved by {{actor}}.",
        },
      ],
    },
  },
  {
    id: "done-unflag",
    name: "When an issue is done → remove the flag",
    description: "Finished work should not stay flagged as an impediment.",
    rule: {
      name: "Unflag finished issues",
      enabled: true,
      trigger: "STATUS_CHANGED",
      conditions: { toStatus: "DONE" },
      actions: [{ type: "SET_FLAG", flagged: false }],
    },
  },
];
