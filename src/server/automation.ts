import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import type { Issue, IssueStatus } from "../app/data/issues";
import type { JqlContext } from "../app/data/jql";
import type { NotificationType } from "../app/data/notifications";
import {
  isDoneStatus,
  isSubtaskLevel,
  statusName,
  typeName,
  type ProjectWorkflow,
} from "../app/data/workflow";
import { PRIORITY_LABELS } from "../app/data/issues";
import { notifyRecipients } from "./notifications";
import { loadWorkflow } from "./workflows";
import {
  AUTOMATION_ACTOR_NAME,
  FIELD_ACTION_TYPES,
  branchTargets,
  changedFieldsOf,
  triggersForEvent,
  computeNextRunAt,
  fieldChangeMatches,
  ifElseActions,
  isEmptyPlan,
  matchesConditions,
  parseActions,
  parseConditions,
  parseSchedule,
  planActions,
  renderSmartValues,
  type AutomationAction,
  type AutomationConditions,
  type AutomationIssueContext,
  type AutomationRule,
  type AutomationRuleData,
  type AutomationRuleUpdate,
  type AutomationRunEntry,
  type AutomationRunStatus,
  type AutomationTriggerType,
  type FieldValue,
  type IfConditions,
  type LeafAction,
  type SmartValueContext,
} from "./automationRules";

export type AutomationTrigger = AutomationTriggerType;

export type AutomationEvent = {
  trigger: AutomationTrigger;
  issueId: string;
  projectId: string;
  actor: { id: string; name: string; organizationId: string };
  fromStatus?: IssueStatus;
  toStatus?: IssueStatus;
  /** Fields the triggering edit changed (update events only). */
  changedFields?: string[];
};

type Actor = { id: string; name: string; organizationId: string };

const automationScope = new AsyncLocalStorage<boolean>();
const AUTOMATION_NOTIFICATION_TYPE: NotificationType = "AUTOMATION";
const MAX_BRANCH_ISSUES = 100;
const MAX_BATCH_ISSUES = 500;

/* ------------------------------------------------------------------ */
/* Run context                                                          */
/* ------------------------------------------------------------------ */

type MemberInfo = { name: string; userId: string; role: string; email: string };

type RunContext = {
  organizationId: string;
  organizationKey: string;
  projectId: string;
  initiator: Actor;
  initiatorMemberId: string | null;
  members: Map<string, MemberInfo>;
  labelNames: Record<string, string>;
  workflow: ProjectWorkflow;
  sprint: { name: string } | null;
  version: { name: string } | null;
  rule: { id: string; name: string };
  trigger: AutomationTrigger;
  fromStatus?: IssueStatus;
  toStatus?: IssueStatus;
  now: Date;
  jqlContext?: JqlContext;
};

type BaseContext = Omit<
  RunContext,
  "rule" | "trigger" | "fromStatus" | "toStatus"
>;

async function loadBaseContext(
  projectId: string,
  initiator: Actor,
  extras: {
    sprint?: { name: string } | null;
    version?: { name: string } | null;
  } = {},
): Promise<BaseContext | null> {
  const organizationId = initiator.organizationId;
  const [organization, members, labels, workflow] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { key: true },
    }),
    prisma.member.findMany({
      where: { organizationId },
      select: {
        id: true,
        role: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.label.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
    loadWorkflow(prisma, projectId),
  ]);
  if (!organization) return null;
  const memberMap = new Map(
    members.map((member) => [
      member.id,
      {
        name: member.user.name,
        userId: member.userId,
        role: member.role,
        email: member.user.email,
      },
    ]),
  );
  return {
    organizationId,
    organizationKey: organization.key,
    projectId,
    initiator,
    initiatorMemberId:
      members.find((member) => member.userId === initiator.id)?.id ?? null,
    members: memberMap,
    labelNames: Object.fromEntries(
      labels.map((label) => [label.id, label.name]),
    ),
    workflow,
    sprint: extras.sprint ?? null,
    version: extras.version ?? null,
    now: new Date(),
  };
}

/** The workspace actor automation acts as: the initiating user, shown as automation. */
function automationActor(ctx: RunContext) {
  return {
    id: ctx.initiator.id,
    name: AUTOMATION_ACTOR_NAME,
    organizationId: ctx.organizationId,
    organizationKey: ctx.organizationKey,
  };
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

/* ------------------------------------------------------------------ */
/* Issue snapshots                                                      */
/* ------------------------------------------------------------------ */

async function issueModule() {
  return import("./issues");
}

type Snapshot = {
  context: AutomationIssueContext;
  issue: Issue;
  smart: SmartValueContext;
  assigneeUserId: string | null;
  reporterUserId: string | null;
  watcherUserIds: string[];
};

function dateKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function customFieldValues(raw: string): Record<string, FieldValue> {
  try {
    const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
    const values: Record<string, FieldValue> = {};
    for (const [key, value] of Object.entries(parsed ?? {})) {
      values[`cf:${key}`] =
        value === null || value === undefined || value === ""
          ? null
          : Array.isArray(value)
            ? value.map((item) => String(item))
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);
    }
    return values;
  } catch {
    return {};
  }
}

async function loadSnapshot(
  issueId: string,
  ctx: RunContext,
): Promise<Snapshot | null> {
  const { issueInclude, serializeIssue } = await issueModule();
  const stored = await prisma.issue.findFirst({
    where: { id: issueId, organizationId: ctx.organizationId, deletedAt: null },
    include: issueInclude,
  });
  if (!stored) return null;
  const [siblings, children] = await Promise.all([
    stored.parentId
      ? prisma.issue.findMany({
          where: { parentId: stored.parentId, deletedAt: null },
          select: { status: true },
        })
      : Promise.resolve(null),
    prisma.issue.findMany({
      where: { parentId: stored.id, deletedAt: null },
      select: { id: true },
      orderBy: { rank: "asc" },
    }),
  ]);
  const issue = serializeIssue(stored);
  const reporterMemberId = stored.creatorId
    ? ([...ctx.members.entries()].find(
        ([, member]) => member.userId === stored.creatorId,
      )?.[0] ?? null)
    : null;
  const assigneeName = stored.assignee?.user.name ?? null;
  const reporterName = stored.creator?.name ?? null;

  const fields: Record<string, FieldValue> = {
    title: stored.title,
    description: stored.description,
    status: [stored.status, statusName(stored.status, ctx.workflow.statuses)],
    priority: [
      stored.priority,
      PRIORITY_LABELS[issue.priority] ?? stored.priority,
    ],
    kind: [stored.kind, typeName(stored.kind, ctx.workflow.types)],
    assigneeId: stored.assignee
      ? [
          stored.assignee.id,
          stored.assignee.user.name,
          stored.assignee.user.email,
        ]
      : null,
    reporter: stored.creator
      ? [
          reporterMemberId ?? "",
          stored.creator.name,
          stored.creator.email,
        ].filter(Boolean)
      : null,
    labelIds: stored.labels.flatMap((entry) => [
      entry.label.id,
      entry.label.name,
    ]),
    fixVersionId: stored.fixVersion
      ? [stored.fixVersion.id, stored.fixVersion.name]
      : null,
    componentIds: stored.components.flatMap((entry) => [
      entry.component.id,
      entry.component.name,
    ]),
    cycleId: stored.cycle ? [stored.cycle.id, stored.cycle.name] : null,
    dueDate: dateKey(stored.dueDate),
    startDate: dateKey(stored.startDate),
    estimate: stored.estimate === null ? null : String(stored.estimate),
    teamId: stored.team ? [stored.team.id, stored.team.name] : null,
    goalId: stored.goal ? [stored.goal.id, stored.goal.name] : null,
    parentId: stored.parentId,
    flagged: stored.flagged ? "true" : "false",
    ...customFieldValues(stored.customFields),
  };

  const context: AutomationIssueContext = {
    key: stored.id,
    title: stored.title,
    kind: stored.kind as AutomationIssueContext["kind"],
    status: stored.status as IssueStatus,
    priority: stored.priority as AutomationIssueContext["priority"],
    assigneeId: stored.assigneeId,
    labelIds: stored.labels.map((entry) => entry.labelId),
    flagged: stored.flagged,
    parentId: stored.parentId,
    siblingStatuses: siblings
      ? siblings.map((sibling) => sibling.status as IssueStatus)
      : null,
    reporterMemberId,
    childIds: children.map((child) => child.id),
    fields,
  };

  const smart: SmartValueContext = {
    issue: {
      key: stored.id,
      summary: stored.title,
      status: statusName(stored.status, ctx.workflow.statuses),
      priority: PRIORITY_LABELS[issue.priority] ?? stored.priority,
      type: typeName(stored.kind, ctx.workflow.types),
      assignee: assigneeName,
      reporter: reporterName,
      url: `${appUrl()}/issues/${encodeURIComponent(stored.id)}`,
      dueDate: dateKey(stored.dueDate),
      description: stored.description,
      parentKey: stored.parentId,
    },
    initiator: ctx.initiator.name,
    now: ctx.now,
    sprint: ctx.sprint ?? (stored.cycle ? { name: stored.cycle.name } : null),
    version:
      ctx.version ??
      (stored.fixVersion ? { name: stored.fixVersion.name } : null),
    rule: { name: ctx.rule.name },
  };

  return {
    context,
    issue,
    smart,
    assigneeUserId: stored.assignee?.userId ?? null,
    reporterUserId: stored.creatorId,
    watcherUserIds: stored.watchers.map((watcher) => watcher.userId),
  };
}

function issuelessSmartValues(ctx: RunContext): SmartValueContext {
  return {
    initiator: ctx.initiator.name,
    now: ctx.now,
    sprint: ctx.sprint,
    version: ctx.version,
    rule: { name: ctx.rule.name },
  };
}

/* ------------------------------------------------------------------ */
/* JQL                                                                  */
/* ------------------------------------------------------------------ */

async function jqlContextFor(ctx: RunContext) {
  if (!ctx.jqlContext) {
    const { loadJqlContext } = await import("./jql");
    ctx.jqlContext = await loadJqlContext(
      ctx.organizationId,
      ctx.initiator.id,
      ctx.now,
    );
  }
  return ctx.jqlContext;
}

async function jqlEvaluator(ctx: RunContext, issue: Issue) {
  const { parseJql, evaluateJql } = await import("../app/data/jql");
  const jqlContext = await jqlContextFor(ctx);
  return (query: string) => {
    const parsed = parseJql(query, ctx.now);
    if (!parsed.ok)
      throw new Error(`Invalid JQL “${query}”: ${parsed.error.message}`);
    return evaluateJql(parsed.query.where, issue, jqlContext);
  };
}

/** Issue keys in this project matching `jql` (empty JQL = every open issue). */
async function searchProjectIssues(
  ctx: RunContext,
  jql: string,
  limit: number,
) {
  const { issueInclude, serializeIssue } = await issueModule();
  const { searchIssuesWithJql } = await import("../app/data/jql");
  const stored = await prisma.issue.findMany({
    where: {
      projectId: ctx.projectId,
      organizationId: ctx.organizationId,
      deletedAt: null,
    },
    include: issueInclude,
    orderBy: { rank: "asc" },
  });
  const result = searchIssuesWithJql(
    stored.map(serializeIssue),
    jql.trim(),
    await jqlContextFor(ctx),
  );
  if (!result.ok)
    throw new Error(`Invalid JQL “${jql}”: ${result.error.message}`);
  return result.issues.slice(0, limit).map((issue) => issue.id);
}

function conditionEnvironment(
  ctx: RunContext,
  jql: (query: string) => boolean,
) {
  return {
    jql,
    initiatorMemberId: ctx.initiatorMemberId,
    memberRoles: Object.fromEntries(
      [...ctx.members.entries()].map(([id, member]) => [id, member.role]),
    ),
  };
}

function needsJql(conditions: AutomationConditions | IfConditions) {
  return Boolean(conditions.checks?.some((check) => check.type === "JQL"));
}

async function conditionsPass(
  conditions: AutomationConditions | IfConditions,
  snapshot: Snapshot,
  ctx: RunContext,
) {
  const jql = needsJql(conditions)
    ? await jqlEvaluator(ctx, snapshot.issue)
    : () => false;
  return matchesConditions(
    conditions,
    snapshot.context,
    {
      trigger: ctx.trigger,
      fromStatus: ctx.fromStatus,
      toStatus: ctx.toStatus,
    },
    conditionEnvironment(ctx, jql),
  );
}

/* ------------------------------------------------------------------ */
/* Action execution                                                     */
/* ------------------------------------------------------------------ */

type Outcome = { done: string[]; errors: string[] };

function statusFields(status: IssueStatus) {
  return isDoneStatus(status)
    ? { status, resolution: "DONE", resolvedAt: new Date() }
    : { status, resolution: null, resolvedAt: null };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

async function applyFieldActions(
  actions: LeafAction[],
  issueKey: string,
  ctx: RunContext,
  outcome: Outcome,
) {
  const snapshot = await loadSnapshot(issueKey, ctx);
  if (!snapshot) {
    outcome.errors.push(`${issueKey}: issue not found`);
    return;
  }
  const issue = snapshot.context;
  const memberNames = Object.fromEntries(
    [...ctx.members.entries()].map(([id, member]) => [id, member.name]),
  );
  const plan = planActions(actions, issue, snapshot.smart, {
    memberNames,
    labelNames: ctx.labelNames,
    workflow: ctx.workflow,
    initiatorMemberId: ctx.initiatorMemberId,
    now: ctx.now,
  });
  if (isEmptyPlan(plan)) return;

  const statusKeys = new Set(ctx.workflow.statuses.map((status) => status.key));
  // Rules may reference statuses later removed from the workflow; skip those.
  if (plan.issueUpdates.status && !statusKeys.has(plan.issueUpdates.status)) {
    outcome.errors.push(
      `${issueKey}: status ${plan.issueUpdates.status} is not in the workflow`,
    );
    delete plan.issueUpdates.status;
  }
  if (plan.parentStatus && !statusKeys.has(plan.parentStatus)) {
    outcome.errors.push(
      `${issueKey}: status ${plan.parentStatus} is not in the workflow`,
    );
    plan.parentStatus = null;
  }

  const { assigneeId, status, dueDate, teamId, goalId, fixVersionId, ...rest } =
    plan.issueUpdates;
  const issueData: Prisma.IssueUncheckedUpdateInput = { ...rest };
  if (assigneeId === null || (assigneeId && ctx.members.has(assigneeId))) {
    issueData.assigneeId = assigneeId;
  } else if (assigneeId) {
    outcome.errors.push(`${issueKey}: the assignee is no longer a member`);
  }
  if (status) Object.assign(issueData, statusFields(status));
  if (dueDate !== undefined) {
    issueData.dueDate = dueDate ? new Date(`${dueDate}T12:00:00.000Z`) : null;
  }
  if (teamId !== undefined) {
    if (
      teamId === null ||
      (await prisma.team.count({
        where: { id: teamId, organizationId: ctx.organizationId },
      }))
    ) {
      issueData.teamId = teamId;
    } else outcome.errors.push(`${issueKey}: team not found`);
  }
  if (goalId !== undefined) {
    if (
      goalId === null ||
      (await prisma.goal.count({
        where: { id: goalId, organizationId: ctx.organizationId },
      }))
    ) {
      issueData.goalId = goalId;
    } else outcome.errors.push(`${issueKey}: goal not found`);
  }
  if (fixVersionId !== undefined) {
    if (
      fixVersionId === null ||
      (await prisma.version.count({
        where: { id: fixVersionId, projectId: ctx.projectId },
      }))
    ) {
      issueData.fixVersionId = fixVersionId;
    } else outcome.errors.push(`${issueKey}: version not found`);
  }
  const addLabelIds = plan.addLabelIds.filter((id) => ctx.labelNames[id]);
  const removeLabelIds = plan.removeLabelIds;

  const changed =
    Object.keys(issueData).length > 0 ||
    addLabelIds.length > 0 ||
    removeLabelIds.length > 0 ||
    plan.comments.length > 0 ||
    Boolean(plan.parentStatus && issue.parentId);
  if (!changed) return;

  const prefix = `Rule "${ctx.rule.name}"`;
  await prisma.$transaction(async (tx) => {
    if (Object.keys(issueData).length > 0) {
      await tx.issue.update({ where: { id: issue.key }, data: issueData });
    }
    if (addLabelIds.length > 0) {
      await tx.issueLabel.createMany({
        data: addLabelIds.map((labelId) => ({ issueId: issue.key, labelId })),
        skipDuplicates: true,
      });
    }
    if (removeLabelIds.length > 0) {
      await tx.issueLabel.deleteMany({
        where: { issueId: issue.key, labelId: { in: removeLabelIds } },
      });
    }
    for (const body of plan.comments) {
      await tx.comment.create({
        data: { body, author: AUTOMATION_ACTOR_NAME, issueId: issue.key },
      });
    }
    if (plan.parentStatus && issue.parentId) {
      const parent = await tx.issue.findFirst({
        where: { id: issue.parentId, organizationId: ctx.organizationId },
        select: { id: true, status: true },
      });
      if (parent && parent.status !== plan.parentStatus) {
        await tx.issue.update({
          where: { id: parent.id },
          data: statusFields(plan.parentStatus),
        });
        await tx.activity.create({
          data: {
            type: "AUTOMATION",
            actor: AUTOMATION_ACTOR_NAME,
            description: `${prefix} changed status to ${statusName(
              plan.parentStatus,
              ctx.workflow.statuses,
            )}`,
            issueId: parent.id,
          },
        });
      }
    }
    await tx.activity.create({
      data: {
        type: "AUTOMATION",
        actor: AUTOMATION_ACTOR_NAME,
        description: `${prefix} ${plan.descriptions.join(", ")}`,
        issueId: issue.key,
      },
    });
  });

  if (issueData.assigneeId && typeof issueData.assigneeId === "string") {
    const member = ctx.members.get(issueData.assigneeId);
    if (member) {
      await notifyRecipients([member.userId], {
        type: "ISSUE_ASSIGNED",
        title: `Assigned: ${issue.title}`,
        body: `${AUTOMATION_ACTOR_NAME} assigned ${issue.key} to you`,
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        issueId: issue.key,
        actorId: null,
      });
    }
  }
  outcome.done.push(`${issue.key}: ${plan.descriptions.join(", ")}`);
}

async function createIssueAction(
  input: {
    kind: string;
    summary: string;
    description?: string;
    priority?: string;
    parentId: string | null;
    assigneeId?: string | null;
  },
  ctx: RunContext,
) {
  const { createIssue } = await issueModule();
  const assigneeId =
    input.assigneeId && ctx.members.has(input.assigneeId)
      ? input.assigneeId
      : null;
  const created = await createIssue(
    {
      title: input.summary.slice(0, 255),
      description: input.description ?? "",
      priority: (input.priority ?? "MEDIUM") as Issue["priority"],
      kind: input.kind as Issue["kind"],
      estimate: null,
      cycleId: null,
      projectId: ctx.projectId,
      assigneeId,
      dueDate: null,
      labelIds: [],
      parentId: input.parentId,
    },
    automationActor(ctx),
  );
  return created.id;
}

async function runEffectAction(
  action: LeafAction,
  snapshot: Snapshot | null,
  ctx: RunContext,
  outcome: Outcome,
) {
  const smart = snapshot?.smart ?? issuelessSmartValues(ctx);
  const issueKey = snapshot?.context.key ?? null;
  switch (action.type) {
    case "CREATE_ISSUE": {
      if (action.parent === "TRIGGER" && !issueKey) {
        outcome.errors.push(
          "Create issue: there is no trigger issue to use as parent",
        );
        return;
      }
      const summary = renderSmartValues(action.summary, smart).trim();
      if (!summary) {
        outcome.errors.push("Create issue: the summary rendered empty");
        return;
      }
      const id = await createIssueAction(
        {
          kind: action.kind,
          summary,
          description: action.description
            ? renderSmartValues(action.description, smart)
            : "",
          priority: action.priority,
          parentId: action.parent === "TRIGGER" ? issueKey : null,
          assigneeId: action.assigneeId,
        },
        ctx,
      );
      outcome.done.push(`created ${id}`);
      return;
    }
    case "CREATE_SUBTASKS": {
      if (!issueKey) {
        outcome.errors.push("Create subtasks: there is no trigger issue");
        return;
      }
      const subtaskType = ctx.workflow.types.find((type) =>
        isSubtaskLevel(type.key),
      );
      if (!subtaskType) {
        outcome.errors.push(
          "Create subtasks: this project has no subtask work type",
        );
        return;
      }
      if (isSubtaskLevel(snapshot?.context.kind)) {
        outcome.errors.push(
          `Create subtasks: ${issueKey} is already a subtask`,
        );
        return;
      }
      const created: string[] = [];
      for (const raw of action.summaries) {
        const summary = renderSmartValues(raw, smart).trim();
        if (!summary) continue;
        created.push(
          await createIssueAction(
            { kind: subtaskType.key, summary, parentId: issueKey },
            ctx,
          ),
        );
      }
      if (created.length)
        outcome.done.push(
          `${issueKey}: created subtasks ${created.join(", ")}`,
        );
      return;
    }
    case "CLONE_ISSUE": {
      if (!issueKey) {
        outcome.errors.push("Clone issue: there is no trigger issue");
        return;
      }
      const { cloneIssue } = await import("./issueOperations");
      const title = action.summary
        ? renderSmartValues(action.summary, smart).trim()
        : "";
      const clone = await cloneIssue(
        issueKey,
        title.length >= 4 ? { title: title.slice(0, 255) } : {},
        automationActor(ctx),
      );
      if (clone) outcome.done.push(`${issueKey}: cloned as ${clone.id}`);
      return;
    }
    case "LINK_ISSUES": {
      if (!issueKey) {
        outcome.errors.push("Link issues: there is no trigger issue");
        return;
      }
      const target = renderSmartValues(action.target, smart)
        .trim()
        .toUpperCase();
      if (!target) {
        outcome.errors.push("Link issues: the target issue rendered empty");
        return;
      }
      const { addIssueLink, IssueActionError } =
        await import("./issueRelations");
      try {
        await addIssueLink(
          issueKey,
          { type: action.linkType, targetId: target },
          automationActor(ctx),
        );
        outcome.done.push(`${issueKey}: linked to ${target}`);
      } catch (error) {
        if (error instanceof IssueActionError && error.status === 409) return;
        throw error;
      }
      return;
    }
    case "NOTIFY": {
      const userIds = new Set<string>();
      for (const recipient of action.recipients ?? []) {
        if (recipient === "ASSIGNEE" && snapshot?.assigneeUserId)
          userIds.add(snapshot.assigneeUserId);
        if (recipient === "REPORTER" && snapshot?.reporterUserId)
          userIds.add(snapshot.reporterUserId);
        if (recipient === "WATCHERS")
          snapshot?.watcherUserIds.forEach((id) => userIds.add(id));
        if (recipient === "INITIATOR") userIds.add(ctx.initiator.id);
      }
      for (const memberId of action.memberIds ?? []) {
        const member = ctx.members.get(memberId);
        if (member) userIds.add(member.userId);
      }
      if (userIds.size === 0) return;
      await notifyRecipients([...userIds], {
        // Closest existing type (title = sentence, body = note); see report.
        type: AUTOMATION_NOTIFICATION_TYPE,
        title: action.subject
          ? renderSmartValues(action.subject, smart)
          : issueKey
            ? `Automation: ${issueKey}`
            : `Automation: ${ctx.rule.name}`,
        body: renderSmartValues(action.message, smart),
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        issueId: issueKey,
        actorId: null,
      });
      outcome.done.push(
        `sent a notification to ${userIds.size} recipient${userIds.size === 1 ? "" : "s"}`,
      );
      return;
    }
    default:
      return;
  }
}

/** Runs leaf actions on one issue (or with no issue), grouping field edits. */
async function runLeafActions(
  actions: LeafAction[],
  issueKey: string | null,
  ctx: RunContext,
  outcome: Outcome,
) {
  let pendingFieldActions: LeafAction[] = [];
  const flush = async () => {
    if (!pendingFieldActions.length) return;
    const batch = pendingFieldActions;
    pendingFieldActions = [];
    if (!issueKey) {
      outcome.errors.push(
        `${batch.length} issue action(s) skipped: the rule has no issue to act on`,
      );
      return;
    }
    await applyFieldActions(batch, issueKey, ctx, outcome);
  };

  for (const action of actions) {
    if (FIELD_ACTION_TYPES.has(action.type)) {
      pendingFieldActions.push(action);
      continue;
    }
    try {
      await flush();
      const snapshot = issueKey ? await loadSnapshot(issueKey, ctx) : null;
      await runEffectAction(action, snapshot, ctx, outcome);
    } catch (error) {
      outcome.errors.push(
        `${issueKey ? `${issueKey}: ` : ""}${errorText(error)}`,
      );
    }
  }
  try {
    await flush();
  } catch (error) {
    outcome.errors.push(
      `${issueKey ? `${issueKey}: ` : ""}${errorText(error)}`,
    );
  }
}

async function runActions(
  actions: AutomationAction[],
  issueKey: string | null,
  ctx: RunContext,
  outcome: Outcome,
) {
  let leaves: LeafAction[] = [];
  const flush = async () => {
    if (!leaves.length) return;
    const batch = leaves;
    leaves = [];
    await runLeafActions(batch, issueKey, ctx, outcome);
  };

  for (const action of actions) {
    if (action.type !== "IF_ELSE" && action.type !== "BRANCH") {
      leaves.push(action);
      continue;
    }
    await flush();
    try {
      if (action.type === "IF_ELSE") {
        if (!issueKey) {
          outcome.errors.push(
            "If/else skipped: the rule has no issue to check",
          );
          continue;
        }
        const snapshot = await loadSnapshot(issueKey, ctx);
        if (!snapshot) continue;
        const matched = await conditionsPass(action.conditions, snapshot, ctx);
        await runLeafActions(
          ifElseActions(action, matched),
          issueKey,
          ctx,
          outcome,
        );
        continue;
      }

      const snapshot = issueKey ? await loadSnapshot(issueKey, ctx) : null;
      const jqlMatches =
        action.scope === "JQL"
          ? await searchProjectIssues(
              ctx,
              snapshot
                ? renderSmartValues(action.jql ?? "", snapshot.smart)
                : (action.jql ?? ""),
              MAX_BRANCH_ISSUES,
            )
          : [];
      const targets = branchTargets(
        action.scope,
        snapshot?.context ?? null,
        jqlMatches,
      );
      for (const target of targets.slice(0, MAX_BRANCH_ISSUES)) {
        await runLeafActions(action.actions, target, ctx, outcome);
      }
    } catch (error) {
      outcome.errors.push(errorText(error));
    }
  }
  await flush();
}

/* ------------------------------------------------------------------ */
/* Rule execution and logging                                           */
/* ------------------------------------------------------------------ */

type StoredRuleRow = {
  id: string;
  name: string;
  trigger: string;
  conditions: string;
  actions: string;
  schedule?: string | null;
};

type RunResult = {
  status: AutomationRunStatus;
  message: string;
  issueId: string | null;
};

function truncate(text: string, length = 1000) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function summarize(
  outcome: Outcome,
  fallback: string,
): Omit<RunResult, "issueId"> {
  if (outcome.errors.length) {
    return {
      status: "ERROR",
      message: truncate(
        [...outcome.errors, ...outcome.done.map((entry) => `OK ${entry}`)].join(
          "; ",
        ),
      ),
    };
  }
  if (outcome.done.length) {
    return { status: "SUCCESS", message: truncate(outcome.done.join("; ")) };
  }
  return { status: "NO_ACTION", message: fallback };
}

async function recordRun(ruleId: string, result: RunResult) {
  await prisma.automationRunLog.create({
    data: {
      ruleId,
      status: result.status,
      message: result.message,
      issueId: result.issueId,
    },
  });
  await prisma.automationRule.update({
    where: { id: ruleId },
    data: {
      lastRunAt: new Date(),
      ...(result.status === "SUCCESS" ? { runCount: { increment: 1 } } : {}),
    },
  });
}

/** Evaluates a rule's conditions on one issue and runs its actions. */
async function executeOnIssue(
  rule: StoredRuleRow,
  issueKey: string,
  ctx: RunContext,
  options: { logNoAction: boolean },
): Promise<RunResult | null> {
  const outcome: Outcome = { done: [], errors: [] };
  try {
    const snapshot = await loadSnapshot(issueKey, ctx);
    if (!snapshot) return null;
    if (ctx.trigger === "ISSUE_ASSIGNED" && !snapshot.context.assigneeId)
      return null;
    if (
      !(await conditionsPass(parseConditions(rule.conditions), snapshot, ctx))
    ) {
      const result: RunResult = {
        status: "NO_ACTION",
        message: "The issue did not match the rule's conditions",
        issueId: issueKey,
      };
      if (options.logNoAction) await recordRun(rule.id, result);
      return result;
    }
    await runActions(parseActions(rule.actions), issueKey, ctx, outcome);
  } catch (error) {
    outcome.errors.push(errorText(error));
  }
  const result = {
    ...summarize(outcome, "Conditions matched but nothing needed to change"),
    issueId: issueKey,
  };
  if (result.status !== "NO_ACTION" || options.logNoAction) {
    await recordRun(rule.id, result);
  }
  return result;
}

/** Runs a rule over a set of issues (scheduled, sprint and version rules). */
async function executeOnIssues(
  rule: StoredRuleRow,
  issueKeys: string[],
  ctx: RunContext,
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const key of issueKeys.slice(0, MAX_BATCH_ISSUES)) {
    const result = await executeOnIssue(rule, key, ctx, { logNoAction: false });
    if (result) results.push(result);
  }
  if (!results.some((result) => result.status !== "NO_ACTION")) {
    const empty: RunResult = {
      status: "NO_ACTION",
      message: issueKeys.length
        ? `None of the ${issueKeys.length} issue(s) needed changes`
        : "No issues matched",
      issueId: null,
    };
    await recordRun(rule.id, empty);
    return [empty];
  }
  return results.filter((result) => result.status !== "NO_ACTION");
}

/** Runs a rule with no trigger issue (scheduled rules without JQL). */
async function executeIssueless(rule: StoredRuleRow, ctx: RunContext) {
  const outcome: Outcome = { done: [], errors: [] };
  try {
    await runActions(parseActions(rule.actions), null, ctx, outcome);
  } catch (error) {
    outcome.errors.push(errorText(error));
  }
  const result = {
    ...summarize(outcome, "No actions performed"),
    issueId: null,
  };
  await recordRun(rule.id, result);
  return [result];
}

function withRule(
  base: BaseContext,
  rule: StoredRuleRow,
  extras: Partial<RunContext> = {},
): RunContext {
  return {
    ...base,
    rule: { id: rule.id, name: rule.name },
    trigger: rule.trigger as AutomationTrigger,
    ...extras,
  };
}

/**
 * Runs the project's enabled automation rules for an issue event. Failures
 * are logged and swallowed: automation must never block the user's edit.
 * Actions run inside an automation scope, so they can never re-trigger
 * automation (no rule loops).
 */
export async function runAutomations(event: AutomationEvent) {
  if (automationScope.getStore()) return;

  await automationScope.run(true, async () => {
    try {
      const triggers = triggersForEvent(event);
      const changed = changedFieldsOf(event);
      const rules = (
        await prisma.automationRule.findMany({
          where: {
            projectId: event.projectId,
            trigger: { in: triggers },
            enabled: true,
            project: { organizationId: event.actor.organizationId },
          },
          orderBy: { createdAt: "asc" },
        })
      ).filter(
        (rule) =>
          rule.trigger !== "FIELD_CHANGED" ||
          fieldChangeMatches(parseConditions(rule.conditions).fields, changed),
      );
      if (!rules.length) return;

      const base = await loadBaseContext(event.projectId, event.actor);
      if (!base) return;
      for (const rule of rules) {
        try {
          await executeOnIssue(
            rule,
            event.issueId,
            withRule(base, rule, {
              fromStatus: event.fromStatus,
              toStatus: event.toStatus,
              now: new Date(),
            }),
            { logNoAction: true },
          );
        } catch (error) {
          console.error(`Automation rule ${rule.id} failed`, error);
        }
      }
    } catch (error) {
      console.error("Automation could not run", error);
    }
  });
}

/**
 * Runs "Sprint started" / "Sprint completed" rules for the sprint's issues.
 * Pass `issueIds` for issues that already left the sprint (the unfinished
 * issues completeSprint moved out).
 */
export async function runSprintAutomations(input: {
  trigger: "SPRINT_STARTED" | "SPRINT_COMPLETED";
  sprintId: string;
  projectId: string;
  actor: Actor;
  issueIds?: string[];
}) {
  if (automationScope.getStore()) return;
  await automationScope.run(true, async () => {
    try {
      const rules = await prisma.automationRule.findMany({
        where: {
          projectId: input.projectId,
          trigger: input.trigger,
          enabled: true,
          project: { organizationId: input.actor.organizationId },
        },
        orderBy: { createdAt: "asc" },
      });
      if (!rules.length) return;
      const sprint = await prisma.cycle.findFirst({
        where: {
          id: input.sprintId,
          organizationId: input.actor.organizationId,
        },
        select: {
          name: true,
          issues: { where: { deletedAt: null }, select: { id: true } },
        },
      });
      if (!sprint) return;
      const base = await loadBaseContext(input.projectId, input.actor, {
        sprint: { name: sprint.name },
      });
      if (!base) return;
      const keys = [
        ...new Set([
          ...sprint.issues.map((issue) => issue.id),
          ...(input.issueIds ?? []),
        ]),
      ];
      for (const rule of rules) {
        try {
          await executeOnIssues(rule, keys, withRule(base, rule));
        } catch (error) {
          console.error(`Automation rule ${rule.id} failed`, error);
        }
      }
    } catch (error) {
      console.error("Sprint automation could not run", error);
    }
  });
}

/** Runs "Version released" rules for the version's issues. */
export async function runVersionAutomations(input: {
  versionId: string;
  projectId: string;
  actor: Actor;
}) {
  if (automationScope.getStore()) return;
  await automationScope.run(true, async () => {
    try {
      const rules = await prisma.automationRule.findMany({
        where: {
          projectId: input.projectId,
          trigger: "VERSION_RELEASED",
          enabled: true,
          project: { organizationId: input.actor.organizationId },
        },
        orderBy: { createdAt: "asc" },
      });
      if (!rules.length) return;
      const version = await prisma.version.findFirst({
        where: {
          id: input.versionId,
          projectId: input.projectId,
          project: { organizationId: input.actor.organizationId },
        },
        select: {
          name: true,
          issues: { where: { deletedAt: null }, select: { id: true } },
        },
      });
      if (!version) return;
      const base = await loadBaseContext(input.projectId, input.actor, {
        version: { name: version.name },
      });
      if (!base) return;
      for (const rule of rules) {
        try {
          await executeOnIssues(
            rule,
            version.issues.map((issue) => issue.id),
            withRule(base, rule),
          );
        } catch (error) {
          console.error(`Automation rule ${rule.id} failed`, error);
        }
      }
    } catch (error) {
      console.error("Version automation could not run", error);
    }
  });
}

async function runScheduledRule(
  rule: StoredRuleRow & { projectId: string },
  actor: Actor,
) {
  const base = await loadBaseContext(rule.projectId, actor);
  if (!base) return [];
  const ctx = withRule(base, rule);
  const schedule = parseSchedule(rule.schedule ?? null);
  if (schedule?.jql?.trim()) {
    let keys: string[];
    try {
      keys = await searchProjectIssues(ctx, schedule.jql, MAX_BATCH_ISSUES);
    } catch (error) {
      const result: RunResult = {
        status: "ERROR",
        message: errorText(error),
        issueId: null,
      };
      await recordRun(rule.id, result);
      return [result];
    }
    return executeOnIssues(rule, keys, ctx);
  }
  return executeIssueless(rule, ctx);
}

/** The user scheduled rules act as: the project lead, else an owner. */
async function systemActor(projectId: string): Promise<Actor | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { organizationId: true, leadUserId: true },
  });
  if (!project) return null;
  let userId = project.leadUserId;
  if (userId) {
    const isMember = await prisma.member.count({
      where: { organizationId: project.organizationId, userId },
    });
    if (!isMember) userId = null;
  }
  if (!userId) {
    const fallback = await prisma.member.findFirst({
      where: {
        organizationId: project.organizationId,
        role: { in: ["owner", "admin", "member"] },
      },
      orderBy: { createdAt: "asc" },
      select: { userId: true, role: true },
    });
    const owner = await prisma.member.findFirst({
      where: { organizationId: project.organizationId, role: "owner" },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    userId = owner?.userId ?? fallback?.userId ?? null;
  }
  if (!userId) return null;
  return {
    id: userId,
    name: AUTOMATION_ACTOR_NAME,
    organizationId: project.organizationId,
  };
}

/**
 * Runs every enabled scheduled rule that is due. Each rule is claimed by
 * moving its nextRunAt forward first, so overlapping cron calls never run a
 * rule twice.
 */
export async function runDueScheduledRules(now = new Date()) {
  const due = await prisma.automationRule.findMany({
    where: {
      trigger: "SCHEDULED",
      enabled: true,
      nextRunAt: { lte: now },
      project: { deletedAt: null, archivedAt: null },
    },
    orderBy: { nextRunAt: "asc" },
    take: 50,
  });
  const summary: { ruleId: string; name: string; results: RunResult[] }[] = [];
  for (const rule of due) {
    const schedule = parseSchedule(rule.schedule);
    const next = schedule ? computeNextRunAt(schedule, now) : null;
    const claimed = await prisma.automationRule.updateMany({
      where: { id: rule.id, nextRunAt: rule.nextRunAt },
      data: { nextRunAt: next },
    });
    if (claimed.count === 0) continue;
    const actor = await systemActor(rule.projectId);
    if (!actor) continue;
    const results = await automationScope.run(true, async () => {
      try {
        return await runScheduledRule(rule, actor);
      } catch (error) {
        const result: RunResult = {
          status: "ERROR",
          message: errorText(error),
          issueId: null,
        };
        await recordRun(rule.id, result).catch(() => undefined);
        return [result];
      }
    });
    summary.push({ ruleId: rule.id, name: rule.name, results });
  }
  return summary;
}

export class AutomationRunError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AutomationRunError";
  }
}

/**
 * "Run rule now" (scheduled rules) and the issue menu's "Run automation"
 * (manual rules, which need an issue). Returns the logged results.
 */
export async function runRuleNow(
  projectId: string,
  ruleId: string,
  actor: Actor,
  issueId?: string | null,
) {
  const rule = await prisma.automationRule.findFirst({
    where: {
      id: ruleId,
      projectId,
      project: { organizationId: actor.organizationId },
    },
  });
  if (!rule) return null;
  if (rule.trigger !== "MANUAL" && rule.trigger !== "SCHEDULED") {
    throw new AutomationRunError(
      "Only scheduled and manual rules can be run on demand",
    );
  }
  if (!rule.enabled)
    throw new AutomationRunError("Enable the rule before running it");
  if (rule.trigger === "MANUAL") {
    if (!issueId)
      throw new AutomationRunError("Choose an issue to run this rule on");
    const issue = await prisma.issue.findFirst({
      where: {
        id: issueId,
        projectId,
        organizationId: actor.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!issue)
      throw new AutomationRunError("Issue not found in this project", 404);
  }

  return automationScope.run(true, async () => {
    if (rule.trigger === "SCHEDULED") return runScheduledRule(rule, actor);
    const base = await loadBaseContext(projectId, actor);
    if (!base) return [];
    const result = await executeOnIssue(
      rule,
      issueId as string,
      withRule(base, rule),
      {
        logNoAction: true,
      },
    );
    return result ? [result] : [];
  });
}

/* ------------------------------------------------------------------ */
/* Rule CRUD                                                            */
/* ------------------------------------------------------------------ */

type StoredRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  conditions: string;
  actions: string;
  schedule: string | null;
  nextRunAt: Date | null;
  runCount: number;
  lastRunAt: Date | null;
  createdAt: Date;
};

function serializeRule(rule: StoredRule): AutomationRule {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.trigger as AutomationTrigger,
    conditions: parseConditions(rule.conditions),
    actions: parseActions(rule.actions),
    schedule: parseSchedule(rule.schedule),
    nextRunAt: rule.nextRunAt?.toISOString() ?? null,
    runCount: rule.runCount,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
  };
}

async function findProject(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
}

export async function listAutomationRules(
  projectId: string,
  organizationId: string,
  filters: { trigger?: string } = {},
) {
  if (!(await findProject(projectId, organizationId))) return null;
  const rules = await prisma.automationRule.findMany({
    where: {
      projectId,
      ...(filters.trigger ? { trigger: filters.trigger } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  return rules.map(serializeRule);
}

function scheduleColumns(
  trigger: AutomationTrigger,
  schedule: AutomationRuleData["schedule"],
  enabled: boolean,
) {
  if (trigger !== "SCHEDULED" || !schedule) {
    return { schedule: null, nextRunAt: null };
  }
  return {
    schedule: JSON.stringify(schedule),
    nextRunAt: enabled ? computeNextRunAt(schedule, new Date()) : null,
  };
}

export async function createAutomationRule(
  projectId: string,
  input: AutomationRuleData,
  organizationId: string,
) {
  if (!(await findProject(projectId, organizationId))) return null;
  const rule = await prisma.automationRule.create({
    data: {
      projectId,
      name: input.name,
      enabled: input.enabled,
      trigger: input.trigger,
      conditions: JSON.stringify(input.conditions),
      actions: JSON.stringify(input.actions),
      ...scheduleColumns(input.trigger, input.schedule, input.enabled),
    },
  });
  return serializeRule(rule);
}

export async function getAutomationRule(
  projectId: string,
  ruleId: string,
  organizationId: string,
) {
  const rule = await prisma.automationRule.findFirst({
    where: { id: ruleId, projectId, project: { organizationId } },
  });
  return rule ? serializeRule(rule) : null;
}

export class AutomationRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationRuleError";
  }
}

export async function updateAutomationRule(
  projectId: string,
  ruleId: string,
  updates: AutomationRuleUpdate,
  organizationId: string,
) {
  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, projectId, project: { organizationId } },
  });
  if (!existing) return null;

  const { conditions, actions, schedule, ...fields } = updates;
  const trigger = (updates.trigger ?? existing.trigger) as AutomationTrigger;
  const enabled = updates.enabled ?? existing.enabled;
  const nextSchedule =
    schedule !== undefined ? schedule : parseSchedule(existing.schedule);
  if (trigger === "SCHEDULED" && !nextSchedule) {
    throw new AutomationRuleError("Scheduled rules need a schedule");
  }
  const scheduleChanged =
    schedule !== undefined ||
    updates.trigger !== undefined ||
    (updates.enabled !== undefined && updates.enabled !== existing.enabled);

  const rule = await prisma.automationRule.update({
    where: { id: ruleId },
    data: {
      ...fields,
      ...(conditions !== undefined
        ? { conditions: JSON.stringify(conditions) }
        : {}),
      ...(actions !== undefined ? { actions: JSON.stringify(actions) } : {}),
      ...(scheduleChanged
        ? scheduleColumns(trigger, nextSchedule, enabled)
        : {}),
    },
  });
  return serializeRule(rule);
}

export async function deleteAutomationRule(
  projectId: string,
  ruleId: string,
  organizationId: string,
) {
  const result = await prisma.automationRule.deleteMany({
    where: { id: ruleId, projectId, project: { organizationId } },
  });
  return result.count > 0;
}

/* ------------------------------------------------------------------ */
/* Audit log                                                            */
/* ------------------------------------------------------------------ */

export type RunLogFilters = {
  ruleId?: string;
  status?: AutomationRunStatus;
  issueId?: string;
  limit?: number;
  cursor?: string | null;
};

export async function listAutomationRuns(
  projectId: string,
  organizationId: string,
  filters: RunLogFilters = {},
) {
  if (!(await findProject(projectId, organizationId))) return null;
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const runs = await prisma.automationRunLog.findMany({
    where: {
      rule: { projectId },
      ...(filters.ruleId ? { ruleId: filters.ruleId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.issueId
        ? {
            issueId: {
              contains: filters.issueId.trim(),
              mode: "insensitive" as const,
            },
          }
        : {}),
    },
    include: { rule: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });
  const page = runs.slice(0, limit);
  return {
    runs: page.map((run): AutomationRunEntry => ({
      id: run.id,
      ruleId: run.ruleId,
      ruleName: run.rule.name,
      status: run.status as AutomationRunStatus,
      message: run.message,
      issueId: run.issueId,
      createdAt: run.createdAt.toISOString(),
    })),
    nextCursor: runs.length > limit ? page[page.length - 1].id : null,
  };
}
