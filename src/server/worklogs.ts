import { z } from "zod";
import prisma from "../../prisma/client";
import { getIssue, type WorkspaceActor, actorAccessUser } from "./issues";
import { IssueActionError } from "./issueRelations";
import { formatDuration } from "../app/data/issues";
import type {
  RemainingEstimateMode,
  Worklog,
} from "../app/components/issue/types";

const MAX_WORKLOG_MINUTES = 2400 * 52;

const remainingSchema = z
  .object({
    mode: z.enum(["AUTO", "LEAVE", "SET"]),
    minutes: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict()
  .refine((value) => value.mode !== "SET" || value.minutes !== undefined, {
    message: "Provide the new remaining estimate",
  });

export const createWorklogSchema = z
  .object({
    minutes: z.number().int().min(1).max(MAX_WORKLOG_MINUTES),
    startedAt: z.string().datetime({ offset: true }),
    comment: z.string().trim().max(2000).nullable().optional(),
    remaining: remainingSchema.optional(),
  })
  .strict();

export const updateWorklogSchema = z
  .object({
    minutes: z.number().int().min(1).max(MAX_WORKLOG_MINUTES).optional(),
    startedAt: z.string().datetime({ offset: true }).optional(),
    comment: z.string().trim().max(2000).nullable().optional(),
    remaining: remainingSchema.optional(),
  })
  .strict();

/**
 * Jira "adjust automatically": logged time burns the remaining estimate
 * (falling back to the original), never below zero. A negative delta (a
 * deleted or shortened log) gives time back.
 */
export function nextRemainingEstimate(
  current: { remaining: number | null; original: number | null },
  loggedDelta: number,
  mode: RemainingEstimateMode = "AUTO",
  setMinutes?: number,
): number | null {
  if (mode === "LEAVE") return current.remaining;
  if (mode === "SET") return setMinutes ?? current.remaining;
  const base = current.remaining ?? current.original;
  if (base === null) return null;
  return Math.max(0, base - loggedDelta);
}

export function canEditWorklog(
  worklogUserId: string | null,
  actorId: string,
) {
  return worklogUserId !== null && worklogUserId === actorId;
}

export function canDeleteWorklog(
  worklogUserId: string | null,
  actorId: string,
  role: string,
) {
  return role === "owner" || canEditWorklog(worklogUserId, actorId);
}

type StoredWorklog = {
  id: string;
  minutes: number;
  startedAt: Date;
  comment: string | null;
  author: string;
  userId: string | null;
  createdAt: Date;
};

function serializeWorklog(worklog: StoredWorklog): Worklog {
  return {
    id: worklog.id,
    minutes: worklog.minutes,
    startedAt: worklog.startedAt.toISOString(),
    comment: worklog.comment,
    author: worklog.author,
    userId: worklog.userId,
    createdAt: worklog.createdAt.toISOString(),
  };
}

export async function listWorklogs(issueId: string, organizationId: string) {
  const exists = await prisma.issue.count({
    where: { id: issueId, organizationId },
  });
  if (!exists) return null;

  const worklogs = await prisma.worklog.findMany({
    where: { issueId },
    orderBy: { startedAt: "desc" },
  });
  return worklogs.map(serializeWorklog);
}

export async function createWorklog(
  issueId: string,
  input: z.infer<typeof createWorklogSchema>,
  actor: WorkspaceActor,
) {
  const worklog = await prisma.$transaction(async (transaction) => {
    const issue = await transaction.issue.findFirst({
      where: { id: issueId, organizationId: actor.organizationId },
      select: {
        remainingEstimateMinutes: true,
        originalEstimateMinutes: true,
      },
    });
    if (!issue) return null;

    const created = await transaction.worklog.create({
      data: {
        issueId,
        minutes: input.minutes,
        startedAt: new Date(input.startedAt),
        comment: input.comment || null,
        userId: actor.id,
        author: actor.name,
      },
    });
    await transaction.issue.update({
      where: { id: issueId },
      data: {
        timeSpentMinutes: { increment: input.minutes },
        remainingEstimateMinutes: nextRemainingEstimate(
          {
            remaining: issue.remainingEstimateMinutes,
            original: issue.originalEstimateMinutes,
          },
          input.minutes,
          input.remaining?.mode,
          input.remaining?.minutes,
        ),
        activity: {
          create: {
            type: "WORK_LOGGED",
            description: `logged ${formatDuration(input.minutes)}`,
            actor: actor.name,
            user: { connect: { id: actor.id } },
          },
        },
      },
    });
    return created;
  });
  if (!worklog) return null;

  return {
    worklog: serializeWorklog(worklog),
    issue: await getIssue(issueId, actor.organizationId, actorAccessUser(actor)),
  };
}

async function findWorklog(
  issueId: string,
  worklogId: string,
  organizationId: string,
) {
  return prisma.worklog.findFirst({
    where: { id: worklogId, issueId, issue: { organizationId } },
    include: {
      issue: {
        select: {
          remainingEstimateMinutes: true,
          originalEstimateMinutes: true,
          timeSpentMinutes: true,
        },
      },
    },
  });
}

export async function updateWorklog(
  issueId: string,
  worklogId: string,
  input: z.infer<typeof updateWorklogSchema>,
  actor: WorkspaceActor,
) {
  const existing = await findWorklog(issueId, worklogId, actor.organizationId);
  if (!existing) return null;
  if (!canEditWorklog(existing.userId, actor.id)) {
    throw new IssueActionError("You can only edit your own work logs", 403);
  }

  const delta =
    input.minutes !== undefined ? input.minutes - existing.minutes : 0;

  const worklog = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.worklog.update({
      where: { id: worklogId },
      data: {
        ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
        ...(input.startedAt ? { startedAt: new Date(input.startedAt) } : {}),
        ...(input.comment !== undefined
          ? { comment: input.comment || null }
          : {}),
      },
    });
    if (delta !== 0 || input.remaining) {
      await transaction.issue.update({
        where: { id: issueId },
        data: {
          timeSpentMinutes: Math.max(
            0,
            existing.issue.timeSpentMinutes + delta,
          ),
          remainingEstimateMinutes: nextRemainingEstimate(
            {
              remaining: existing.issue.remainingEstimateMinutes,
              original: existing.issue.originalEstimateMinutes,
            },
            delta,
            input.remaining?.mode,
            input.remaining?.minutes,
          ),
          activity: {
            create: {
              type: "TIME_TRACKING_CHANGED",
              description: `updated a work log to ${formatDuration(
                updated.minutes,
              )}`,
              actor: actor.name,
              user: { connect: { id: actor.id } },
            },
          },
        },
      });
    }
    return updated;
  });

  return {
    worklog: serializeWorklog(worklog),
    issue: await getIssue(issueId, actor.organizationId, actorAccessUser(actor)),
  };
}

export async function deleteWorklog(
  issueId: string,
  worklogId: string,
  actor: WorkspaceActor,
  role: string,
) {
  const existing = await findWorklog(issueId, worklogId, actor.organizationId);
  if (!existing) return null;
  if (!canDeleteWorklog(existing.userId, actor.id, role)) {
    throw new IssueActionError("You can only delete your own work logs", 403);
  }

  await prisma.$transaction([
    prisma.worklog.delete({ where: { id: worklogId } }),
    prisma.issue.update({
      where: { id: issueId },
      data: {
        timeSpentMinutes: Math.max(
          0,
          existing.issue.timeSpentMinutes - existing.minutes,
        ),
        remainingEstimateMinutes: nextRemainingEstimate(
          {
            remaining: existing.issue.remainingEstimateMinutes,
            original: existing.issue.originalEstimateMinutes,
          },
          -existing.minutes,
        ),
        activity: {
          create: {
            type: "TIME_TRACKING_CHANGED",
            description: `deleted a work log of ${formatDuration(
              existing.minutes,
            )}`,
            actor: actor.name,
            user: { connect: { id: actor.id } },
          },
        },
      },
    }),
  ]);

  return getIssue(issueId, actor.organizationId, actorAccessUser(actor));
}
