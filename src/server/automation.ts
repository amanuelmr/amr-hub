import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import type { IssueStatus } from "../app/data/issues";
import { isDoneStatus, statusName } from "../app/data/workflow";
import { loadWorkflow } from "./workflows";
import {
  matchesConditions,
  parseActions,
  parseConditions,
  planActions,
  type AutomationIssueContext,
  type AutomationRule,
  type AutomationRuleInput,
  type AutomationTriggerType,
} from "./automationRules";

export type AutomationTrigger = AutomationTriggerType;

export type AutomationEvent = {
  trigger: AutomationTrigger;
  issueId: string;
  projectId: string;
  actor: { id: string; name: string; organizationId: string };
  fromStatus?: IssueStatus;
  toStatus?: IssueStatus;
};

const AUTOMATION_ACTOR = "Automation";
const automationScope = new AsyncLocalStorage<boolean>();

function statusFields(status: IssueStatus) {
  return isDoneStatus(status)
    ? { status, resolution: "DONE", resolvedAt: new Date() }
    : { status, resolution: null, resolvedAt: null };
}

async function loadIssueContext(
  issueId: string,
  organizationId: string,
): Promise<AutomationIssueContext | null> {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId },
    include: {
      labels: { select: { labelId: true } },
      parent: { select: { children: { select: { status: true } } } },
    },
  });
  if (!issue) return null;

  const reporter = issue.creatorId
    ? await prisma.member.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: issue.creatorId,
          },
        },
        select: { id: true },
      })
    : null;

  return {
    key: issue.id,
    title: issue.title,
    kind: issue.kind as AutomationIssueContext["kind"],
    status: issue.status as IssueStatus,
    priority: issue.priority as AutomationIssueContext["priority"],
    assigneeId: issue.assigneeId,
    labelIds: issue.labels.map((label) => label.labelId),
    flagged: issue.flagged,
    parentId: issue.parentId,
    siblingStatuses: issue.parent
      ? issue.parent.children.map((child) => child.status as IssueStatus)
      : null,
    reporterMemberId: reporter?.id ?? null,
  };
}

async function executeRule(
  rule: { id: string; name: string; conditions: string; actions: string },
  event: AutomationEvent,
) {
  const organizationId = event.actor.organizationId;
  const issue = await loadIssueContext(event.issueId, organizationId);
  if (!issue) return;

  if (!matchesConditions(parseConditions(rule.conditions), issue, event)) {
    return;
  }

  const actions = parseActions(rule.actions);
  const [members, labels, workflow] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId },
      select: { id: true, user: { select: { name: true } } },
    }),
    prisma.label.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
    loadWorkflow(prisma, event.projectId),
  ]);
  const statusKeys = new Set(workflow.statuses.map((status) => status.key));
  const memberNames = Object.fromEntries(
    members.map((member) => [member.id, member.user.name]),
  );
  const labelNames = Object.fromEntries(
    labels.map((label) => [label.id, label.name]),
  );

  const plan = planActions(
    actions,
    issue,
    {
      issueKey: issue.key,
      issueSummary: issue.title,
      actor: event.actor.name,
    },
    memberNames,
    labelNames,
    workflow,
  );
  // Rules may reference statuses later removed from the workflow; skip those.
  if (plan.issueUpdates.status && !statusKeys.has(plan.issueUpdates.status)) {
    delete plan.issueUpdates.status;
  }
  if (plan.parentStatus && !statusKeys.has(plan.parentStatus)) {
    plan.parentStatus = null;
  }

  const { assigneeId, status, ...rest } = plan.issueUpdates;
  const issueData: Prisma.IssueUncheckedUpdateInput = { ...rest };
  if (assigneeId === null || (assigneeId && memberNames[assigneeId])) {
    issueData.assigneeId = assigneeId;
  }
  if (status) Object.assign(issueData, statusFields(status));
  const validLabelIds = plan.addLabelIds.filter((id) => labelNames[id]);

  if (
    Object.keys(issueData).length === 0 &&
    validLabelIds.length === 0 &&
    plan.comments.length === 0 &&
    !plan.parentStatus
  ) {
    return;
  }

  const prefix = `Rule "${rule.name}"`;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(issueData).length > 0) {
      await tx.issue.update({ where: { id: issue.key }, data: issueData });
    }

    if (validLabelIds.length > 0) {
      await tx.issueLabel.createMany({
        data: validLabelIds.map((labelId) => ({ issueId: issue.key, labelId })),
        skipDuplicates: true,
      });
    }

    for (const body of plan.comments) {
      await tx.comment.create({
        data: { body, author: AUTOMATION_ACTOR, issueId: issue.key },
      });
    }

    if (plan.parentStatus && issue.parentId) {
      const parent = await tx.issue.findFirst({
        where: { id: issue.parentId, organizationId },
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
            actor: AUTOMATION_ACTOR,
            description: `${prefix} changed status to ${statusName(
              plan.parentStatus,
              workflow.statuses,
            )} after all subtasks were done`,
            issueId: parent.id,
          },
        });
      }
    }

    await tx.activity.create({
      data: {
        type: "AUTOMATION",
        actor: AUTOMATION_ACTOR,
        description: `${prefix} ${plan.descriptions.join(", ")}`,
        issueId: issue.key,
      },
    });

    await tx.automationRule.update({
      where: { id: rule.id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });
  });
}

/**
 * Runs the project's enabled automation rules for an issue event. Failures
 * are logged and swallowed: automation must never block the user's edit.
 * Actions are written directly with prisma inside an automation scope, so
 * they can never re-trigger automation (no rule loops).
 */
export async function runAutomations(event: AutomationEvent) {
  if (automationScope.getStore()) return;

  await automationScope.run(true, async () => {
    try {
      const rules = await prisma.automationRule.findMany({
        where: {
          projectId: event.projectId,
          trigger: event.trigger,
          enabled: true,
          project: { organizationId: event.actor.organizationId },
        },
        orderBy: { createdAt: "asc" },
      });

      for (const rule of rules) {
        try {
          await executeRule(rule, event);
        } catch (error) {
          console.error(`Automation rule ${rule.id} failed`, error);
        }
      }
    } catch (error) {
      console.error("Automation could not run", error);
    }
  });
}

type StoredRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  conditions: string;
  actions: string;
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
) {
  if (!(await findProject(projectId, organizationId))) return null;
  const rules = await prisma.automationRule.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return rules.map(serializeRule);
}

export async function createAutomationRule(
  projectId: string,
  input: AutomationRuleInput,
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
    },
  });
  return serializeRule(rule);
}

export async function updateAutomationRule(
  projectId: string,
  ruleId: string,
  updates: Partial<AutomationRuleInput>,
  organizationId: string,
) {
  const existing = await prisma.automationRule.findFirst({
    where: { id: ruleId, projectId, project: { organizationId } },
  });
  if (!existing) return null;

  const { conditions, actions, ...fields } = updates;
  const rule = await prisma.automationRule.update({
    where: { id: ruleId },
    data: {
      ...fields,
      ...(conditions !== undefined
        ? { conditions: JSON.stringify(conditions) }
        : {}),
      ...(actions !== undefined ? { actions: JSON.stringify(actions) } : {}),
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
