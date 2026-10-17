import { z } from "zod";
import { dispatchWebhook } from "./webhooks";
import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { createIssue, getIssue, type WorkspaceActor } from "./issues";
import { IssueActionError } from "./issueRelations";
import {
  isSubtaskLevel,
  isTodoStatus,
  mapStatusByCategory,
  mapTypeByLevel,
} from "../app/data/workflow";
import { loadWorkflow, subtaskKindWhere } from "./workflows";
import {
  type IssueEstimate,
  type IssueKind,
  type IssuePriority,
  type IssueStatus,
} from "../app/data/issues";

export const cloneIssueSchema = z
  .object({
    title: z.string().trim().min(4).max(255).optional(),
    includeChildren: z.boolean().optional(),
    includeLinks: z.boolean().optional(),
  })
  .strict();

export const moveIssueSchema = z
  .object({ projectId: z.string().trim().min(1).max(120) })
  .strict();

export function cloneTitle(title: string) {
  return `CLONE - ${title}`.slice(0, 255);
}

/** A clone starts in the To Do category unless the source was still there. */
export function cloneStatus(status: IssueStatus): IssueStatus {
  return isTodoStatus(status) ? status : "OPEN";
}

export function canDeleteIssue(
  creatorId: string | null,
  actorId: string,
  role: string,
) {
  return role === "owner" || (creatorId !== null && creatorId === actorId);
}

function dateKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

const cloneSourceInclude = {
  labels: { select: { labelId: true } },
  components: { select: { componentId: true } },
  outgoingLinks: { select: { targetId: true, type: true } },
  incomingLinks: { select: { sourceId: true, type: true } },
} satisfies Prisma.IssueInclude;

type CloneSource = Prisma.IssueGetPayload<{
  include: typeof cloneSourceInclude;
}>;

function cloneInput(
  source: CloneSource,
  title: string,
  parentId: string | null,
  statusKeys: Set<string>,
) {
  const status = cloneStatus(source.status as IssueStatus);
  return {
    title,
    description: source.description,
    priority: source.priority as IssuePriority,
    kind: source.kind as IssueKind,
    estimate: source.estimate as IssueEstimate | null,
    cycleId: source.cycleId,
    projectId: source.projectId,
    assigneeId: source.assigneeId,
    dueDate: dateKey(source.dueDate),
    labelIds: source.labels.map((label) => label.labelId),
    // Fall back to the project's default create status when OPEN was removed.
    status: statusKeys.has(status) ? status : undefined,
    parentId,
    fixVersionId: source.fixVersionId,
    componentIds: source.components.map((component) => component.componentId),
    startDate: dateKey(source.startDate),
    originalEstimateMinutes: source.originalEstimateMinutes,
    environment: source.environment,
  };
}

export async function cloneIssue(
  issueId: string,
  options: z.infer<typeof cloneIssueSchema>,
  actor: WorkspaceActor,
) {
  const source = await prisma.issue.findFirst({
    where: { id: issueId, organizationId: actor.organizationId },
    include: {
      ...cloneSourceInclude,
      children: { include: cloneSourceInclude, orderBy: { rank: "asc" } },
    },
  });
  if (!source) return null;

  const workflow = await loadWorkflow(prisma, source.projectId);
  const statusKeys = new Set(workflow.statuses.map((status) => status.key));
  const clone = await createIssue(
    cloneInput(
      source,
      options.title ?? cloneTitle(source.title),
      source.parentId,
      statusKeys,
    ),
    actor,
  );

  const links: Prisma.IssueLinkCreateManyInput[] = [
    { sourceId: clone.id, targetId: source.id, type: "CLONES" },
  ];
  if (options.includeLinks) {
    for (const link of source.outgoingLinks) {
      links.push({ sourceId: clone.id, targetId: link.targetId, type: link.type });
    }
    for (const link of source.incomingLinks) {
      links.push({ sourceId: link.sourceId, targetId: clone.id, type: link.type });
    }
  }
  await prisma.issueLink.createMany({ data: links, skipDuplicates: true });
  await prisma.activity.create({
    data: {
      issueId: source.id,
      type: "LINK_ADDED",
      description: `linked this issue: is cloned by ${clone.id}`,
      actor: actor.name,
      actorId: actor.id,
    },
  });

  if (options.includeChildren) {
    for (const child of source.children) {
      await createIssue(
        cloneInput(child, child.title, clone.id, statusKeys),
        actor,
      );
    }
  }

  return getIssue(clone.id, actor.organizationId);
}

/**
 * The issue key is the primary key, so moving re-creates the row under the
 * target project's key and re-points every dependent row before deleting
 * the original. Subtasks travel with their parent.
 */
export async function moveIssue(
  issueId: string,
  targetProjectId: string,
  actor: WorkspaceActor,
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId: actor.organizationId },
    include: {
      children: {
        where: subtaskKindWhere(),
        select: { id: true },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!issue) return null;
  if (isSubtaskLevel(issue.kind)) {
    throw new IssueActionError("Move the parent issue to move its subtasks");
  }

  const project = await prisma.project.findFirst({
    where: { id: targetProjectId, organizationId: actor.organizationId },
    select: { id: true, key: true, name: true },
  });
  if (!project) throw new IssueActionError("The target project does not exist");
  if (project.id === issue.projectId) {
    throw new IssueActionError("The issue is already in that project");
  }

  // Jira's move: keep the status/type when the target has it, otherwise map
  // the status by category and the type by hierarchy level.
  const targetWorkflow = await loadWorkflow(prisma, project.id);

  const newId = await prisma.$transaction(
    async (transaction) => {
      const latest = await transaction.issue.findFirst({
        where: { projectId: project.id },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const lastRanked = await transaction.issue.findFirst({
        where: { projectId: project.id },
        orderBy: { rank: "desc" },
        select: { rank: true },
      });
      let sequence = latest?.sequence ?? 0;
      let rank = lastRanked?.rank ?? 0;
      const idMap = new Map<string, string>();

      const movedIds = [issue.id, ...issue.children.map((child) => child.id)];
      for (const oldId of movedIds) {
        const row = await transaction.issue.findUniqueOrThrow({
          where: { id: oldId },
        });
        sequence += 1;
        rank += 1000;
        const nextId = `${project.key}-${sequence}`;
        idMap.set(oldId, nextId);
        const { parentId } = row;
        await transaction.issue.create({
          data: {
            title: row.title,
            description: row.description,
            status: mapStatusByCategory(row.status, targetWorkflow.statuses),
            priority: row.priority,
            kind: mapTypeByLevel(row.kind, targetWorkflow.types),
            assigneeId: row.assigneeId,
            creatorId: row.creatorId,
            dueDate: row.dueDate,
            estimate: row.estimate,
            organizationId: row.organizationId,
            startDate: row.startDate,
            flagged: row.flagged,
            resolution: row.resolution,
            resolvedAt: row.resolvedAt,
            environment: row.environment,
            originalEstimateMinutes: row.originalEstimateMinutes,
            remainingEstimateMinutes: row.remainingEstimateMinutes,
            timeSpentMinutes: row.timeSpentMinutes,
            createdAt: row.createdAt,
            id: nextId,
            sequence,
            rank,
            projectId: project.id,
            cycleId: null,
            fixVersionId: null,
            // A parent left behind in the old project no longer applies.
            parentId: parentId ? (idMap.get(parentId) ?? null) : null,
          },
        });
      }

      for (const [oldId, nextId] of idMap) {
        const repoint = { where: { issueId: oldId }, data: { issueId: nextId } };
        await transaction.issue.updateMany({
          where: { parentId: oldId, id: { notIn: movedIds } },
          data: { parentId: nextId },
        });
        await transaction.comment.updateMany(repoint);
        await transaction.activity.updateMany(repoint);
        await transaction.issueWatcher.updateMany(repoint);
        await transaction.issueVote.updateMany(repoint);
        await transaction.worklog.updateMany(repoint);
        await transaction.attachment.updateMany(repoint);
        await transaction.issueLabel.updateMany(repoint);
        await transaction.issueView.updateMany(repoint);
        await transaction.notification.updateMany({
          where: { issueId: oldId },
          data: { issueId: nextId, projectId: project.id },
        });
        await transaction.issueLink.updateMany({
          where: { sourceId: oldId },
          data: { sourceId: nextId },
        });
        await transaction.issueLink.updateMany({
          where: { targetId: oldId },
          data: { targetId: nextId },
        });
        await transaction.issueComponent.deleteMany({ where: { issueId: oldId } });
        await transaction.activity.create({
          data: {
            issueId: nextId,
            type: "PROJECT_MOVED",
            description: `moved the issue from ${oldId} to ${project.name} as ${nextId}`,
            actor: actor.name,
            actorId: actor.id,
          },
        });
      }

      await transaction.issue.deleteMany({
        where: { id: { in: [...movedIds].reverse() } },
      });
      return idMap.get(issue.id) as string;
    },
    { timeout: 20_000 },
  );

  return getIssue(newId, actor.organizationId);
}

async function deleteIssueUnhooked(
  issueId: string,
  actor: WorkspaceActor,
  role: string,
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId: actor.organizationId },
    select: { id: true, creatorId: true },
  });
  if (!issue) return false;
  if (!canDeleteIssue(issue.creatorId, actor.id, role)) {
    throw new IssueActionError(
      "Only the reporter or a workspace owner can delete this issue",
      403,
    );
  }

  await prisma.$transaction([
    prisma.issue.updateMany({
      where: { parentId: issue.id },
      data: { parentId: null },
    }),
    prisma.issueView.deleteMany({ where: { issueId: issue.id } }),
    prisma.issue.delete({ where: { id: issue.id } }),
  ]);
  return true;
}

export async function deleteIssue(
  ...args: Parameters<typeof deleteIssueUnhooked>
) {
  const result = await deleteIssueUnhooked(...args);
  dispatchWebhook(args[1].organizationId, "issue_deleted", {
    issueId: args[0],
  });
  return result;
}
