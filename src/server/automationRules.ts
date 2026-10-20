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

/**
 * Pure rule model for project automation (shared by the server engine and the
 * rule builder UI). Nothing here touches the database.
 */

/** Optional project config used to name custom statuses/types. */
type WorkflowNames = Partial<Pick<ProjectWorkflow, "statuses" | "types">>;

/** The display name automation writes comments and activity under. */
export const AUTOMATION_ACTOR_NAME = "Automation for AMR Hub";

/* ------------------------------------------------------------------ */
/* Triggers                                                             */
/* ------------------------------------------------------------------ */

export const AUTOMATION_TRIGGERS = [
  "ISSUE_CREATED",
  "STATUS_CHANGED",
  "ISSUE_UPDATED",
  "FIELD_CHANGED",
  "ISSUE_ASSIGNED",
  "COMMENT_ADDED",
  "SPRINT_STARTED",
  "SPRINT_COMPLETED",
  "VERSION_RELEASED",
  "SCHEDULED",
  "MANUAL",
] as const;

export type AutomationTriggerType = (typeof AUTOMATION_TRIGGERS)[number];

export const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  ISSUE_CREATED: "Issue created",
  STATUS_CHANGED: "Issue transitioned",
  ISSUE_UPDATED: "Issue updated",
  FIELD_CHANGED: "Field value changed",
  ISSUE_ASSIGNED: "Issue assigned",
  COMMENT_ADDED: "Comment added",
  SPRINT_STARTED: "Sprint started",
  SPRINT_COMPLETED: "Sprint completed",
  VERSION_RELEASED: "Version released",
  SCHEDULED: "Scheduled",
  MANUAL: "Manually triggered",
};

export const TRIGGER_DESCRIPTIONS: Record<AutomationTriggerType, string> = {
  ISSUE_CREATED: "Rule runs when an issue is created.",
  STATUS_CHANGED: "Rule runs when an issue moves between statuses.",
  ISSUE_UPDATED: "Rule runs when any field of an issue is edited.",
  FIELD_CHANGED: "Rule runs when one of the chosen fields changes.",
  ISSUE_ASSIGNED: "Rule runs when an issue is assigned to someone.",
  COMMENT_ADDED: "Rule runs when someone comments on an issue.",
  SPRINT_STARTED: "Rule runs for the sprint's issues when a sprint starts.",
  SPRINT_COMPLETED:
    "Rule runs for the sprint's issues (finished and unfinished) when a sprint completes.",
  VERSION_RELEASED: "Rule runs for the version's issues when it is released.",
  SCHEDULED: "Rule runs on a schedule, optionally for issues matching JQL.",
  MANUAL: "Rule runs when someone picks it from an issue's Automation menu.",
};

/** Triggers that fire for one issue as a result of an issue event. */
export const ISSUE_EVENT_TRIGGERS: AutomationTriggerType[] = [
  "ISSUE_CREATED",
  "STATUS_CHANGED",
  "ISSUE_UPDATED",
  "FIELD_CHANGED",
  "ISSUE_ASSIGNED",
  "COMMENT_ADDED",
];

/** Triggers whose rules can be started by hand ("Run rule now"). */
export function canRunNow(trigger: AutomationTriggerType) {
  return trigger === "SCHEDULED" || trigger === "MANUAL";
}

/** Issue fields offered by "Field value changed" and field conditions. */
export const AUTOMATION_FIELDS = [
  { key: "title", label: "Summary" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "kind", label: "Work type" },
  { key: "assigneeId", label: "Assignee" },
  { key: "reporter", label: "Reporter" },
  { key: "labelIds", label: "Labels" },
  { key: "fixVersionId", label: "Fix version" },
  { key: "componentIds", label: "Components" },
  { key: "cycleId", label: "Sprint" },
  { key: "dueDate", label: "Due date" },
  { key: "startDate", label: "Start date" },
  { key: "estimate", label: "Story point estimate" },
  { key: "teamId", label: "Team" },
  { key: "goalId", label: "Goal" },
  { key: "parentId", label: "Parent" },
  { key: "flagged", label: "Flagged" },
  { key: "customFields", label: "Any custom field" },
] as const;

const FIELD_ALIASES: Record<string, string> = {
  summary: "title",
  type: "kind",
  issuetype: "kind",
  assignee: "assigneeId",
  labels: "labelIds",
  label: "labelIds",
  fixversion: "fixVersionId",
  fixversions: "fixVersionId",
  components: "componentIds",
  component: "componentIds",
  sprint: "cycleId",
  cycle: "cycleId",
  duedate: "dueDate",
  due: "dueDate",
  startdate: "startDate",
  storypoints: "estimate",
  team: "teamId",
  goal: "goalId",
  parent: "parentId",
  flag: "flagged",
};

/** Maps Jira-ish field names ("summary", "sprint") to issue update keys. */
export function normalizeFieldKey(field: string) {
  const trimmed = field.trim();
  return FIELD_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function fieldLabel(field: string) {
  const key = normalizeFieldKey(field);
  const known = AUTOMATION_FIELDS.find((candidate) => candidate.key === key);
  if (known) return known.label;
  return key.startsWith("cf:") ? `Custom field ${key.slice(3)}` : key;
}

const KNOWN_FIELD_KEYS = new Set<string>(
  AUTOMATION_FIELDS.map((field) => field.key),
);

/**
 * True when an edit that changed `changed` fields should fire a "Field value
 * changed" rule watching `watched` (no watched fields = any field).
 * Custom field keys match the edit's "customFields" change.
 */
export function fieldChangeMatches(
  watched: string[] | undefined,
  changed: string[],
) {
  const changedKeys = new Set(changed.map(normalizeFieldKey));
  if (changedKeys.size === 0) return false;
  if (!watched?.length) return true;
  return watched.some((field) => {
    const key = normalizeFieldKey(field);
    if (changedKeys.has(key)) return true;
    return !KNOWN_FIELD_KEYS.has(key) && changedKeys.has("customFields");
  });
}

/** The fields an update event changed (bulk transitions only change status). */
export function changedFieldsOf(event: {
  trigger: AutomationTriggerType;
  changedFields?: string[];
}) {
  if (event.changedFields?.length) return event.changedFields;
  return event.trigger === "STATUS_CHANGED" ? ["status"] : [];
}

/** Rule triggers an issue event fires (beyond the event's own trigger). */
export function triggersForEvent(event: {
  trigger: AutomationTriggerType;
  changedFields?: string[];
}): AutomationTriggerType[] {
  const triggers = new Set<AutomationTriggerType>([event.trigger]);
  if (event.trigger === "STATUS_CHANGED" || event.trigger === "ISSUE_UPDATED") {
    triggers.add("FIELD_CHANGED");
    if (changedFieldsOf(event).map(normalizeFieldKey).includes("assigneeId")) {
      triggers.add("ISSUE_ASSIGNED");
    }
  }
  return [...triggers];
}

/* ------------------------------------------------------------------ */
/* Schedules                                                            */
/* ------------------------------------------------------------------ */

export const SCHEDULE_FREQUENCIES = ["HOURLY", "DAILY", "WEEKLY"] as const;
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const automationScheduleSchema = z
  .object({
    frequency: z.enum(SCHEDULE_FREQUENCIES),
    /** HH:MM in UTC. Hourly schedules use only the minutes. */
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24 hour)")
      .default("09:00"),
    /** 0 = Sunday. Weekly schedules only. */
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    /** Optional JQL selecting the issues the rule runs on. */
    jql: z.string().trim().max(2000).optional(),
  })
  .strict();

export type AutomationSchedule = z.infer<typeof automationScheduleSchema>;

/** The first scheduled run strictly after `from` (all times UTC). */
export function computeNextRunAt(schedule: AutomationSchedule, from: Date) {
  const [hours, minutes] = (schedule.time ?? "09:00")
    .split(":")
    .map((part) => Number.parseInt(part, 10));
  const next = new Date(from.getTime());
  next.setUTCSeconds(0, 0);

  if (schedule.frequency === "HOURLY") {
    next.setUTCMinutes(minutes);
    if (next.getTime() <= from.getTime()) {
      next.setUTCHours(next.getUTCHours() + 1);
    }
    return next;
  }

  next.setUTCHours(hours, minutes, 0, 0);
  if (schedule.frequency === "DAILY") {
    if (next.getTime() <= from.getTime())
      next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  const day = schedule.dayOfWeek ?? 1;
  let offset = (day - next.getUTCDay() + 7) % 7;
  if (offset === 0 && next.getTime() <= from.getTime()) offset = 7;
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

export function describeSchedule(
  schedule: AutomationSchedule | null | undefined,
) {
  if (!schedule) return "No schedule";
  const time = schedule.time ?? "09:00";
  const base =
    schedule.frequency === "HOURLY"
      ? `Every hour at :${time.slice(3)}`
      : schedule.frequency === "DAILY"
        ? `Every day at ${time} UTC`
        : `Every ${WEEKDAY_NAMES[schedule.dayOfWeek ?? 1]} at ${time} UTC`;
  return schedule.jql ? `${base} for issues matching “${schedule.jql}”` : base;
}

/* ------------------------------------------------------------------ */
/* Conditions                                                           */
/* ------------------------------------------------------------------ */

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
const idSchema = z.string().trim().min(1).max(120);
const fieldKeySchema = z.string().trim().min(1).max(120);

export const FIELD_OPERATORS = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "NOT_CONTAINS",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
] as const;
export type FieldOperator = (typeof FIELD_OPERATORS)[number];

export const FIELD_OPERATOR_LABELS: Record<FieldOperator, string> = {
  EQUALS: "equals",
  NOT_EQUALS: "does not equal",
  CONTAINS: "contains",
  NOT_CONTAINS: "does not contain",
  IS_EMPTY: "is empty",
  IS_NOT_EMPTY: "is not empty",
};

export const WORKSPACE_ROLES = ["owner", "admin", "member", "viewer"] as const;

export const conditionCheckSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("FIELD"),
      field: fieldKeySchema,
      operator: z.enum(FIELD_OPERATORS),
      value: z.string().trim().max(500).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("JQL"),
      jql: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("USER"),
      /** Who is checked: the person who caused the event, or the issue's people. */
      subject: z
        .enum(["INITIATOR", "ASSIGNEE", "REPORTER"])
        .default("INITIATOR"),
      operator: z.enum(["IN_ROLE", "NOT_IN_ROLE", "IS", "IS_NOT"]),
      roles: z.array(z.enum(WORKSPACE_ROLES)).max(4).optional(),
      memberIds: z.array(idSchema).max(20).optional(),
    })
    .strict(),
]);

export type ConditionCheck = z.infer<typeof conditionCheckSchema>;

const baseConditionShape = {
  issueTypes: z.array(kindSchema).max(5).optional(),
  priorities: z.array(prioritySchema).max(5).optional(),
  labelIds: z.array(idSchema).max(20).optional(),
  assigneeEmpty: z.boolean().optional(),
  allSubtasksDone: z.boolean().optional(),
  /** Advanced conditions: issue fields, JQL and user conditions (all must pass). */
  checks: z.array(conditionCheckSchema).max(10).optional(),
};

/** Conditions inside an If/else block (no trigger options). */
export const ifConditionsSchema = z.object(baseConditionShape).strict();

export const automationConditionsSchema = z
  .object({
    ...baseConditionShape,
    /** "Issue transitioned" options. */
    fromStatus: statusSchema.nullable().optional(),
    toStatus: statusSchema.nullable().optional(),
    /** "Field value changed" watched fields (empty = any field). */
    fields: z.array(fieldKeySchema).max(20).optional(),
  })
  .strict();

export type AutomationConditions = z.infer<typeof automationConditionsSchema>;
export type IfConditions = z.infer<typeof ifConditionsSchema>;

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

export const LINK_TYPES = [
  "BLOCKS",
  "IS_BLOCKED_BY",
  "RELATES_TO",
  "DUPLICATES",
  "IS_DUPLICATED_BY",
  "CLONES",
  "IS_CLONED_BY",
] as const;

const assignModeSchema = z.enum([
  "MEMBER",
  "REPORTER",
  "INITIATOR",
  "UNASSIGN",
]);

const leafActionOptions = [
  z
    .object({
      type: z.literal("ASSIGN"),
      mode: assignModeSchema,
      memberId: idSchema.nullable().optional(),
    })
    .strict(),
  z.object({ type: z.literal("TRANSITION"), status: statusSchema }).strict(),
  z
    .object({ type: z.literal("TRANSITION_PARENT"), status: statusSchema })
    .strict(),
  z
    .object({ type: z.literal("SET_PRIORITY"), priority: prioritySchema })
    .strict(),
  z.object({ type: z.literal("ADD_LABEL"), labelId: idSchema }).strict(),
  z
    .object({
      type: z.literal("ADD_COMMENT"),
      body: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z.object({ type: z.literal("SET_FLAG"), flagged: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("EDIT_FIELDS"),
      summary: z.string().trim().min(1).max(255).optional(),
      description: z.string().max(20000).optional(),
      priority: prioritySchema.optional(),
      assignee: z
        .object({
          mode: assignModeSchema,
          memberId: idSchema.nullable().optional(),
        })
        .strict()
        .optional(),
      labels: z
        .object({
          mode: z.enum(["ADD", "REMOVE", "SET"]),
          labelIds: z.array(idSchema).max(20),
        })
        .strict()
        .optional(),
      /** "" clears; "+3d", "-1w", "today" or YYYY-MM-DD. */
      dueDate: z.string().trim().max(20).optional(),
      estimate: z.number().int().min(0).max(1000).nullable().optional(),
      teamId: idSchema.nullable().optional(),
      goalId: idSchema.nullable().optional(),
      fixVersionId: idSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CREATE_ISSUE"),
      kind: kindSchema,
      summary: z.string().trim().min(1).max(255),
      description: z.string().max(20000).optional(),
      priority: prioritySchema.optional(),
      /** TRIGGER = make the new issue a child of the rule's issue. */
      parent: z.enum(["NONE", "TRIGGER"]).default("NONE"),
      assigneeId: idSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CREATE_SUBTASKS"),
      summaries: z.array(z.string().trim().min(1).max(255)).min(1).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("CLONE_ISSUE"),
      summary: z.string().trim().max(255).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("LINK_ISSUES"),
      linkType: z.enum(LINK_TYPES),
      /** An issue key or a smart value such as {{issue.parent.key}}. */
      target: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("NOTIFY"),
      recipients: z
        .array(z.enum(["ASSIGNEE", "REPORTER", "WATCHERS", "INITIATOR"]))
        .max(4)
        .default([]),
      memberIds: z.array(idSchema).max(20).optional(),
      subject: z.string().trim().max(200).optional(),
      message: z.string().trim().min(1).max(2000),
    })
    .strict(),
] as const;

export const leafActionSchema = z.discriminatedUnion("type", [
  ...leafActionOptions,
]);
const leafActionsSchema = z.array(leafActionSchema).max(10);

export const automationActionSchema = z.discriminatedUnion("type", [
  ...leafActionOptions,
  z
    .object({
      type: z.literal("IF_ELSE"),
      conditions: ifConditionsSchema,
      then: leafActionsSchema.min(1),
      else: leafActionsSchema.default([]),
    })
    .strict(),
  z
    .object({
      type: z.literal("BRANCH"),
      scope: z.enum(["SUBTASKS", "PARENT", "JQL"]),
      jql: z.string().trim().max(2000).optional(),
      actions: leafActionsSchema.min(1),
    })
    .strict(),
]);

export type LeafAction = z.infer<typeof leafActionSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type AutomationActionType = AutomationAction["type"];
export type LeafActionType = LeafAction["type"];

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  ASSIGN: "Assign issue",
  TRANSITION: "Transition issue",
  TRANSITION_PARENT: "Transition parent issue",
  SET_PRIORITY: "Set priority",
  ADD_LABEL: "Add label",
  ADD_COMMENT: "Comment on issue",
  SET_FLAG: "Flag / unflag issue",
  EDIT_FIELDS: "Edit issue fields",
  CREATE_ISSUE: "Create issue",
  CREATE_SUBTASKS: "Create subtasks",
  CLONE_ISSUE: "Clone issue",
  LINK_ISSUES: "Link issues",
  NOTIFY: "Send in-app notification",
  IF_ELSE: "If / else block",
  BRANCH: "Branch rule / related issues",
};

export const BRANCH_LABELS = {
  SUBTASKS: "For subtasks",
  PARENT: "For parent",
  JQL: "For issues matching JQL",
} as const;

/** Actions that need no trigger issue (scheduled rules without JQL). */
export function isIssuelessAction(action: AutomationAction) {
  return (
    (action.type === "CREATE_ISSUE" && action.parent !== "TRIGGER") ||
    (action.type === "NOTIFY" && Boolean(action.memberIds?.length)) ||
    (action.type === "BRANCH" && action.scope === "JQL")
  );
}

/* ------------------------------------------------------------------ */
/* Rule input                                                           */
/* ------------------------------------------------------------------ */

const ruleFields = {
  name: z.string().trim().min(2).max(120),
  enabled: z.boolean(),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions: automationConditionsSchema,
  actions: z.array(automationActionSchema).min(1).max(10),
  schedule: automationScheduleSchema.nullable(),
};

function requireSchedule(
  rule: {
    trigger?: AutomationTriggerType;
    schedule?: AutomationSchedule | null;
  },
  ctx: z.RefinementCtx,
) {
  if (rule.trigger === "SCHEDULED" && !rule.schedule) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["schedule"],
      message: "Scheduled rules need a schedule",
    });
  }
}

export const automationRuleInputSchema = z
  .object({
    name: ruleFields.name,
    enabled: ruleFields.enabled.default(true),
    trigger: ruleFields.trigger,
    conditions: ruleFields.conditions.default({}),
    actions: ruleFields.actions,
    schedule: ruleFields.schedule.optional(),
  })
  .strict()
  .superRefine(requireSchedule);

export const automationRuleUpdateSchema = z
  .object({
    name: ruleFields.name.optional(),
    enabled: ruleFields.enabled.optional(),
    trigger: ruleFields.trigger.optional(),
    conditions: ruleFields.conditions.optional(),
    actions: ruleFields.actions.optional(),
    schedule: ruleFields.schedule.optional(),
  })
  .strict()
  .refine((updates) => Object.keys(updates).length > 0, {
    message: "Provide at least one rule field to update",
  });

export type AutomationRuleInput = z.input<typeof automationRuleInputSchema>;
export type AutomationRuleData = z.output<typeof automationRuleInputSchema>;
export type AutomationRuleUpdate = z.output<typeof automationRuleUpdateSchema>;

export type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTriggerType;
  conditions: AutomationConditions;
  actions: AutomationAction[];
  schedule: AutomationSchedule | null;
  nextRunAt: string | null;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
};

export const RUN_STATUSES = ["SUCCESS", "NO_ACTION", "ERROR"] as const;
export type AutomationRunStatus = (typeof RUN_STATUSES)[number];
export const RUN_STATUS_LABELS: Record<AutomationRunStatus, string> = {
  SUCCESS: "Success",
  NO_ACTION: "No actions performed",
  ERROR: "Error",
};

export type AutomationRunEntry = {
  id: string;
  ruleId: string;
  ruleName: string;
  status: AutomationRunStatus;
  message: string;
  issueId: string | null;
  createdAt: string;
};

export function parseConditions(
  raw: string | null | undefined,
): AutomationConditions {
  try {
    const parsed = automationConditionsSchema.safeParse(
      JSON.parse(raw ?? "{}"),
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function parseActions(
  raw: string | null | undefined,
): AutomationAction[] {
  try {
    const parsed = z
      .array(automationActionSchema)
      .safeParse(JSON.parse(raw ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function parseSchedule(
  raw: string | null | undefined,
): AutomationSchedule | null {
  if (!raw) return null;
  try {
    const parsed = automationScheduleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Matching                                                             */
/* ------------------------------------------------------------------ */

export type FieldValue = string | string[] | null;

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
  /** Keys of this issue's children (subtasks). */
  childIds?: string[];
  /**
   * Comparable field values for "Issue fields condition", keyed by field key.
   * Multi-value fields (labels, components) and people (id + name) are arrays.
   */
  fields?: Record<string, FieldValue>;
};

export type AutomationEventContext = {
  trigger: AutomationTriggerType;
  fromStatus?: IssueStatus;
  toStatus?: IssueStatus;
};

/** Facts about people and JQL, resolved by the engine before matching. */
export type ConditionEnvironment = {
  /** Evaluates a JQL condition against the issue. Missing = JQL fails. */
  jql?: (query: string) => boolean;
  /** Workspace role and member id by member id, for user conditions. */
  memberRoles?: Record<string, string>;
  initiatorMemberId?: string | null;
};

function asList(value: FieldValue | undefined) {
  if (value === null || value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter((item) => item !== "");
}

/** Evaluates one "Issue fields condition" (case-insensitive). */
export function evaluateFieldCondition(
  value: FieldValue | undefined,
  operator: FieldOperator,
  expected = "",
) {
  const items = asList(value).map((item) => item.toLowerCase());
  const target = expected.trim().toLowerCase();
  switch (operator) {
    case "IS_EMPTY":
      return items.length === 0;
    case "IS_NOT_EMPTY":
      return items.length > 0;
    case "EQUALS":
      return items.includes(target);
    case "NOT_EQUALS":
      return !items.includes(target);
    case "CONTAINS":
      return items.some((item) => item.includes(target));
    case "NOT_CONTAINS":
      return !items.some((item) => item.includes(target));
  }
}

function fieldValueFor(
  issue: AutomationIssueContext,
  field: string,
): FieldValue | undefined {
  const key = normalizeFieldKey(field);
  if (issue.fields && key in issue.fields) return issue.fields[key];
  switch (key) {
    case "title":
      return issue.title;
    case "status":
      return issue.status;
    case "priority":
      return issue.priority;
    case "kind":
      return issue.kind;
    case "assigneeId":
      return issue.assigneeId;
    case "labelIds":
      return issue.labelIds;
    case "flagged":
      return issue.flagged ? "true" : "false";
    case "parentId":
      return issue.parentId;
    default:
      return issue.fields?.[key.startsWith("cf:") ? key.slice(3) : `cf:${key}`];
  }
}

function personFor(
  subject: "INITIATOR" | "ASSIGNEE" | "REPORTER",
  issue: AutomationIssueContext,
  env: ConditionEnvironment,
) {
  if (subject === "ASSIGNEE") return issue.assigneeId;
  if (subject === "REPORTER") return issue.reporterMemberId;
  return env.initiatorMemberId ?? null;
}

function checkPasses(
  check: ConditionCheck,
  issue: AutomationIssueContext,
  env: ConditionEnvironment,
) {
  switch (check.type) {
    case "FIELD":
      return evaluateFieldCondition(
        fieldValueFor(issue, check.field),
        check.operator,
        check.value,
      );
    case "JQL":
      return env.jql ? env.jql(check.jql) : false;
    case "USER": {
      const memberId = personFor(check.subject ?? "INITIATOR", issue, env);
      if (check.operator === "IS" || check.operator === "IS_NOT") {
        const listed = Boolean(memberId && check.memberIds?.includes(memberId));
        return check.operator === "IS" ? listed : !listed;
      }
      const role = memberId ? env.memberRoles?.[memberId] : undefined;
      const inRole = Boolean(
        role && (check.roles ?? []).includes(role as never),
      );
      return check.operator === "IN_ROLE" ? inRole : !inRole;
    }
  }
}

export function matchesConditions(
  conditions: AutomationConditions | IfConditions,
  issue: AutomationIssueContext,
  event: AutomationEventContext,
  env: ConditionEnvironment = {},
) {
  if (event.trigger === "STATUS_CHANGED") {
    const { fromStatus, toStatus } = conditions as AutomationConditions;
    if (fromStatus && event.fromStatus !== fromStatus) return false;
    if (toStatus && issue.status !== toStatus) return false;
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

  for (const check of conditions.checks ?? []) {
    if (!checkPasses(check, issue, env)) return false;
  }

  return true;
}

/** Issue keys an action branch runs on (JQL branches are resolved by the engine). */
export function branchTargets(
  scope: "SUBTASKS" | "PARENT" | "JQL",
  issue: Pick<AutomationIssueContext, "key" | "parentId" | "childIds"> | null,
  jqlMatches: string[] = [],
) {
  if (scope === "JQL") return jqlMatches.filter((key) => key !== issue?.key);
  if (!issue) return [];
  if (scope === "PARENT") return issue.parentId ? [issue.parentId] : [];
  return issue.childIds ?? [];
}

/** The actions an If/else block runs for a given condition result. */
export function ifElseActions(
  action: Extract<AutomationAction, { type: "IF_ELSE" }>,
  matched: boolean,
) {
  return matched ? action.then : (action.else ?? []);
}

/* ------------------------------------------------------------------ */
/* Smart values                                                         */
/* ------------------------------------------------------------------ */

export type SmartValueContext = {
  issue?: {
    key: string;
    summary: string;
    status?: string;
    priority?: string;
    type?: string;
    assignee?: string | null;
    reporter?: string | null;
    url?: string;
    dueDate?: string | null;
    description?: string;
    parentKey?: string | null;
  };
  /** Display name of the person whose action started the rule. */
  initiator: string;
  now?: Date;
  sprint?: { name: string } | null;
  version?: { name: string } | null;
  rule?: { name: string } | null;
};

function smartValueTable(context: SmartValueContext): Record<string, string> {
  const now = context.now ?? new Date();
  const issue = context.issue;
  const table: Record<string, string> = {
    initiator: context.initiator,
    "initiator.displayName": context.initiator,
    actor: context.initiator,
    now: now.toISOString(),
    "now.date": now.toISOString().slice(0, 10),
    today: now.toISOString().slice(0, 10),
    "sprint.name": context.sprint?.name ?? "",
    "version.name": context.version?.name ?? "",
    "rule.name": context.rule?.name ?? "",
  };
  const issueValues: Record<string, string> = {
    key: issue?.key ?? "",
    summary: issue?.summary ?? "",
    status: issue?.status ?? "",
    priority: issue?.priority ?? "",
    type: issue?.type ?? "",
    issueType: issue?.type ?? "",
    assignee: issue?.assignee ?? "",
    "assignee.displayName": issue?.assignee ?? "",
    reporter: issue?.reporter ?? "",
    "reporter.displayName": issue?.reporter ?? "",
    url: issue?.url ?? "",
    dueDate: issue?.dueDate ?? "",
    duedate: issue?.dueDate ?? "",
    description: issue?.description ?? "",
    "parent.key": issue?.parentKey ?? "",
  };
  for (const [name, value] of Object.entries(issueValues)) {
    table[`issue.${name}`] = value;
  }
  return table;
}

/**
 * Replaces {{smart.values}} in a template. Known values with no data render
 * empty (like Jira); unknown names are left untouched so typos stay visible.
 */
export function renderSmartValues(
  template: string,
  context: SmartValueContext,
) {
  const table = smartValueTable(context);
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name: string) =>
    name in table ? table[name] : match,
  );
}

export const SMART_VALUES = [
  "{{issue.key}}",
  "{{issue.summary}}",
  "{{issue.status}}",
  "{{issue.priority}}",
  "{{issue.assignee}}",
  "{{issue.reporter}}",
  "{{issue.url}}",
  "{{issue.dueDate}}",
  "{{initiator}}",
  "{{now}}",
  "{{sprint.name}}",
  "{{version.name}}",
];

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

/**
 * Resolves a due date spec: "" clears (null), "today", relative offsets like
 * "+3d" / "-1w" / "+2m" (months), or an absolute YYYY-MM-DD.
 * Returns undefined for an invalid spec.
 */
export function resolveRelativeDate(
  spec: string,
  now: Date,
): string | null | undefined {
  const value = spec.trim().toLowerCase();
  if (value === "") return null;
  if (value === "today" || value === "now")
    return now.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? undefined : value;
  }
  const match = /^([+-]?)(\d{1,4})\s*([dwm])$/.exec(value);
  if (!match) return undefined;
  const amount = Number.parseInt(match[2], 10) * (match[1] === "-" ? -1 : 1);
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (match[3] === "d") date.setUTCDate(date.getUTCDate() + amount);
  if (match[3] === "w") date.setUTCDate(date.getUTCDate() + amount * 7);
  if (match[3] === "m") date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Planning field edits                                                 */
/* ------------------------------------------------------------------ */

/** Concrete effects computed from a rule's field actions, applied by the engine. */
export type AutomationPlan = {
  issueUpdates: {
    assigneeId?: string | null;
    status?: IssueStatus;
    priority?: IssuePriority;
    flagged?: boolean;
    title?: string;
    description?: string;
    dueDate?: string | null;
    estimate?: number | null;
    teamId?: string | null;
    goalId?: string | null;
    fixVersionId?: string | null;
  };
  addLabelIds: string[];
  removeLabelIds: string[];
  comments: string[];
  parentStatus: IssueStatus | null;
  descriptions: string[];
};

/** The subset of leaf actions planActions understands (field edits). */
export const FIELD_ACTION_TYPES = new Set<AutomationActionType>([
  "ASSIGN",
  "TRANSITION",
  "TRANSITION_PARENT",
  "SET_PRIORITY",
  "ADD_LABEL",
  "ADD_COMMENT",
  "SET_FLAG",
  "EDIT_FIELDS",
]);

function resolveAssignee(
  mode: z.infer<typeof assignModeSchema>,
  memberId: string | null | undefined,
  issue: AutomationIssueContext,
  initiatorMemberId: string | null | undefined,
) {
  if (mode === "UNASSIGN") return null;
  if (mode === "REPORTER") return issue.reporterMemberId ?? undefined;
  if (mode === "INITIATOR") return initiatorMemberId ?? undefined;
  return memberId ?? undefined;
}

export type PlanOptions = {
  memberNames?: Record<string, string>;
  labelNames?: Record<string, string>;
  workflow?: WorkflowNames;
  initiatorMemberId?: string | null;
  now?: Date;
};

export function planActions(
  actions: AutomationAction[],
  issue: AutomationIssueContext,
  values: SmartValueContext,
  options: PlanOptions = {},
): AutomationPlan {
  const memberNames = options.memberNames ?? {};
  const labelNames = options.labelNames ?? {};
  const workflow = options.workflow ?? {};
  const now = options.now ?? values.now ?? new Date();
  const plan: AutomationPlan = {
    issueUpdates: {},
    addLabelIds: [],
    removeLabelIds: [],
    comments: [],
    parentStatus: null,
    descriptions: [],
  };
  let current = { ...issue, labelIds: [...issue.labelIds] };

  const assign = (next: string | null | undefined) => {
    if (next === undefined || next === current.assigneeId) return;
    plan.issueUpdates.assigneeId = next;
    current = { ...current, assigneeId: next };
    plan.descriptions.push(
      next
        ? `assigned the issue to ${memberNames[next] ?? "a member"}`
        : "unassigned the issue",
    );
  };
  const setPriority = (priority: IssuePriority) => {
    if (priority === current.priority) return;
    plan.issueUpdates.priority = priority;
    current = { ...current, priority };
    plan.descriptions.push(`set priority to ${PRIORITY_LABELS[priority]}`);
  };
  const addLabel = (labelId: string) => {
    if (current.labelIds.includes(labelId)) return;
    if (plan.removeLabelIds.includes(labelId)) {
      plan.removeLabelIds = plan.removeLabelIds.filter((id) => id !== labelId);
    } else {
      plan.addLabelIds.push(labelId);
    }
    current.labelIds.push(labelId);
    plan.descriptions.push(`added label ${labelNames[labelId] ?? labelId}`);
  };
  const removeLabel = (labelId: string) => {
    if (!current.labelIds.includes(labelId)) return;
    if (plan.addLabelIds.includes(labelId)) {
      plan.addLabelIds = plan.addLabelIds.filter((id) => id !== labelId);
    } else {
      plan.removeLabelIds.push(labelId);
    }
    current.labelIds = current.labelIds.filter((id) => id !== labelId);
    plan.descriptions.push(`removed label ${labelNames[labelId] ?? labelId}`);
  };

  for (const action of actions) {
    switch (action.type) {
      case "ASSIGN":
        assign(
          resolveAssignee(
            action.mode,
            action.memberId,
            issue,
            options.initiatorMemberId,
          ),
        );
        break;
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
        setPriority(action.priority);
        break;
      case "ADD_LABEL":
        addLabel(action.labelId);
        break;
      case "ADD_COMMENT":
        plan.comments.push(renderSmartValues(action.body, values));
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
      case "EDIT_FIELDS": {
        if (action.summary !== undefined) {
          const title = renderSmartValues(action.summary, values)
            .trim()
            .slice(0, 255);
          if (title && title !== current.title) {
            plan.issueUpdates.title = title;
            current = { ...current, title };
            plan.descriptions.push("updated the summary");
          }
        }
        if (action.description !== undefined) {
          plan.issueUpdates.description = renderSmartValues(
            action.description,
            values,
          );
          plan.descriptions.push("updated the description");
        }
        if (action.priority) setPriority(action.priority);
        if (action.assignee) {
          assign(
            resolveAssignee(
              action.assignee.mode,
              action.assignee.memberId,
              issue,
              options.initiatorMemberId,
            ),
          );
        }
        if (action.labels) {
          const { mode, labelIds } = action.labels;
          if (mode === "ADD") labelIds.forEach(addLabel);
          if (mode === "REMOVE") labelIds.forEach(removeLabel);
          if (mode === "SET") {
            [...current.labelIds]
              .filter((id) => !labelIds.includes(id))
              .forEach(removeLabel);
            labelIds.forEach(addLabel);
          }
        }
        if (action.dueDate !== undefined) {
          const due = resolveRelativeDate(action.dueDate, now);
          if (due !== undefined) {
            plan.issueUpdates.dueDate = due;
            plan.descriptions.push(
              due ? `set the due date to ${due}` : "cleared the due date",
            );
          }
        }
        if (action.estimate !== undefined) {
          plan.issueUpdates.estimate = action.estimate;
          plan.descriptions.push(
            action.estimate === null
              ? "cleared the estimate"
              : `set the estimate to ${action.estimate}`,
          );
        }
        if (action.teamId !== undefined) {
          plan.issueUpdates.teamId = action.teamId;
          plan.descriptions.push(
            action.teamId ? "set the team" : "cleared the team",
          );
        }
        if (action.goalId !== undefined) {
          plan.issueUpdates.goalId = action.goalId;
          plan.descriptions.push(
            action.goalId ? "set the goal" : "cleared the goal",
          );
        }
        if (action.fixVersionId !== undefined) {
          plan.issueUpdates.fixVersionId = action.fixVersionId;
          plan.descriptions.push(
            action.fixVersionId
              ? "set the fix version"
              : "cleared the fix version",
          );
        }
        break;
      }
      default:
        break;
    }
  }

  return plan;
}

export function isEmptyPlan(plan: AutomationPlan) {
  return (
    Object.keys(plan.issueUpdates).length === 0 &&
    plan.addLabelIds.length === 0 &&
    plan.removeLabelIds.length === 0 &&
    plan.comments.length === 0 &&
    plan.parentStatus === null
  );
}

/* ------------------------------------------------------------------ */
/* Descriptions                                                         */
/* ------------------------------------------------------------------ */

export function describeCheck(
  check: ConditionCheck,
  memberNames: Record<string, string> = {},
) {
  switch (check.type) {
    case "FIELD":
      return `${fieldLabel(check.field)} ${FIELD_OPERATOR_LABELS[check.operator]}${
        check.operator === "IS_EMPTY" || check.operator === "IS_NOT_EMPTY"
          ? ""
          : ` “${check.value ?? ""}”`
      }`;
    case "JQL":
      return `matches JQL “${check.jql}”`;
    case "USER": {
      const who = (check.subject ?? "INITIATOR").toLowerCase();
      if (check.operator === "IS" || check.operator === "IS_NOT") {
        const names = (check.memberIds ?? [])
          .map((id) => memberNames[id] ?? "a member")
          .join(" or ");
        return `${who} ${check.operator === "IS" ? "is" : "is not"} ${names || "anyone"}`;
      }
      return `${who} ${check.operator === "IN_ROLE" ? "is" : "is not"} ${
        (check.roles ?? []).join(" or ") || "in a role"
      }`;
    }
  }
}

export function describeConditions(
  conditions: AutomationConditions | IfConditions,
  workflow: WorkflowNames = {},
  memberNames: Record<string, string> = {},
) {
  const parts: string[] = [];
  if ("fromStatus" in conditions && conditions.fromStatus) {
    parts.push(`from ${statusName(conditions.fromStatus, workflow.statuses)}`);
  }
  if ("toStatus" in conditions && conditions.toStatus) {
    parts.push(`to ${statusName(conditions.toStatus, workflow.statuses)}`);
  }
  if ("fields" in conditions && conditions.fields?.length) {
    parts.push(`${conditions.fields.map(fieldLabel).join(", ")} changed`);
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
  for (const check of conditions.checks ?? []) {
    parts.push(describeCheck(check, memberNames));
  }
  return parts;
}

export function describeAction(action: AutomationAction): string {
  switch (action.type) {
    case "IF_ELSE":
      return `If/else (${action.then.length} then, ${action.else?.length ?? 0} else)`;
    case "BRANCH":
      return `${BRANCH_LABELS[action.scope]}: ${action.actions
        .map((nested) => ACTION_LABELS[nested.type])
        .join(", ")}`;
    default:
      return ACTION_LABELS[action.type];
  }
}

/* ------------------------------------------------------------------ */
/* Templates                                                            */
/* ------------------------------------------------------------------ */

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  category: "Issue management" | "Agile" | "Notifications" | "Scheduled";
  rule: AutomationRuleInput;
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "subtasks-done",
    category: "Issue management",
    name: "When all subtasks are done → close the parent",
    description: "Closes the parent as soon as its last subtask is done.",
    rule: {
      name: "Close parent when subtasks are done",
      trigger: "STATUS_CHANGED",
      conditions: { toStatus: "DONE", allSubtasksDone: true },
      actions: [{ type: "TRANSITION_PARENT", status: "DONE" }],
    },
  },
  {
    id: "bug-high",
    category: "Issue management",
    name: "When a bug is created → set priority High",
    description: "New bugs get triaged as High priority automatically.",
    rule: {
      name: "Bugs start as High priority",
      trigger: "ISSUE_CREATED",
      conditions: { issueTypes: ["BUG"] },
      actions: [{ type: "SET_PRIORITY", priority: "HIGH" }],
    },
  },
  {
    id: "assign-reporter",
    category: "Issue management",
    name: "Auto-assign new issues to the reporter",
    description: "Every issue has an owner from the moment it exists.",
    rule: {
      name: "Assign new issues to the reporter",
      trigger: "ISSUE_CREATED",
      conditions: { assigneeEmpty: true },
      actions: [{ type: "ASSIGN", mode: "REPORTER" }],
    },
  },
  {
    id: "daily-overdue",
    category: "Scheduled",
    name: "Daily: flag overdue issues",
    description:
      "Every morning, flag and comment on unfinished issues past their due date.",
    rule: {
      name: "Flag overdue issues",
      trigger: "SCHEDULED",
      schedule: {
        frequency: "DAILY",
        time: "09:00",
        jql: "duedate < now() AND statusCategory != Done",
      },
      conditions: {},
      actions: [
        { type: "SET_FLAG", flagged: true },
        {
          type: "ADD_COMMENT",
          body: "{{issue.key}} is overdue (due {{issue.dueDate}}). Flagged by automation.",
        },
      ],
    },
  },
  {
    id: "sprint-unfinished",
    category: "Agile",
    name: "When a sprint completes → comment on unfinished issues",
    description:
      "Leaves a note on every issue that did not make it in the sprint.",
    rule: {
      name: "Comment on unfinished sprint issues",
      trigger: "SPRINT_COMPLETED",
      conditions: { checks: [{ type: "JQL", jql: "statusCategory != Done" }] },
      actions: [
        {
          type: "ADD_COMMENT",
          body: "{{issue.key}} was not finished in {{sprint.name}}.",
        },
      ],
    },
  },
  {
    id: "story-subtasks",
    category: "Agile",
    name: "When a story is created → add standard subtasks",
    description:
      "Creates Design, Build and Test subtasks under every new story.",
    rule: {
      name: "Standard subtasks for stories",
      trigger: "ISSUE_CREATED",
      conditions: { issueTypes: ["STORY"] },
      actions: [
        { type: "CREATE_SUBTASKS", summaries: ["Design", "Build", "Test"] },
      ],
    },
  },
  {
    id: "urgent-notify",
    category: "Notifications",
    name: "When priority becomes Urgent → notify watchers",
    description:
      "Everyone watching hears about it the moment an issue is escalated.",
    rule: {
      name: "Notify watchers about urgent issues",
      trigger: "FIELD_CHANGED",
      conditions: {
        fields: ["priority"],
        checks: [
          {
            type: "FIELD",
            field: "priority",
            operator: "EQUALS",
            value: "URGENT",
          },
        ],
      },
      actions: [
        {
          type: "NOTIFY",
          recipients: ["ASSIGNEE", "WATCHERS"],
          message:
            "{{initiator}} raised {{issue.key}} ({{issue.summary}}) to Urgent.",
        },
      ],
    },
  },
  {
    id: "in-progress-assign",
    category: "Issue management",
    name: "When work starts → assign to the person who moved it",
    description:
      "Unassigned issues moved to In progress are assigned to whoever moved them.",
    rule: {
      name: "Assign issues when work starts",
      trigger: "STATUS_CHANGED",
      conditions: { toStatus: "IN_PROGRESS", assigneeEmpty: true },
      actions: [{ type: "ASSIGN", mode: "INITIATOR" }],
    },
  },
  {
    id: "review-comment",
    category: "Notifications",
    name: "When moved to In review → add a comment",
    description: "Leave an audit trail when work is ready for review.",
    rule: {
      name: "Comment when work enters review",
      trigger: "STATUS_CHANGED",
      conditions: { toStatus: "IN_REVIEW" },
      actions: [
        {
          type: "ADD_COMMENT",
          body: "{{issue.key}} ({{issue.summary}}) is ready for review — moved by {{initiator}}.",
        },
      ],
    },
  },
  {
    id: "done-unflag",
    category: "Issue management",
    name: "When an issue is done → remove the flag",
    description: "Finished work should not stay flagged as an impediment.",
    rule: {
      name: "Unflag finished issues",
      trigger: "STATUS_CHANGED",
      conditions: { toStatus: "DONE" },
      actions: [{ type: "SET_FLAG", flagged: false }],
    },
  },
  {
    id: "version-released",
    category: "Agile",
    name: "When a version is released → comment on its issues",
    description: "Tells everyone on an issue which release shipped it.",
    rule: {
      name: "Comment when released",
      trigger: "VERSION_RELEASED",
      conditions: {},
      actions: [{ type: "ADD_COMMENT", body: "Shipped in {{version.name}}." }],
    },
  },
  {
    id: "manual-escalate",
    category: "Issue management",
    name: "Manual: escalate an issue",
    description: "Adds an “Escalate” action to the issue's automation menu.",
    rule: {
      name: "Escalate",
      trigger: "MANUAL",
      conditions: {},
      actions: [
        { type: "EDIT_FIELDS", priority: "URGENT", dueDate: "+2d" },
        { type: "SET_FLAG", flagged: true },
        {
          type: "ADD_COMMENT",
          body: "Escalated by {{initiator}} on {{today}}.",
        },
      ],
    },
  },
];
