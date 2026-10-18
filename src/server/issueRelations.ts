import { isDoneStatus } from "../app/data/workflow";
import { z } from "zod";
import prisma from "../../prisma/client";
import { getIssue, inverseLinkType, type WorkspaceActor, actorAccessUser } from "./issues";
import { issueLinkTypeSchema } from "./issueSchemas";
import { assertIssuePermission, projectPermission } from "./projectAccess";
import { LINK_TYPE_LABELS, type IssueLinkType } from "../app/data/issues";
import type { WatcherSummary } from "../app/components/issue/types";

/** A domain failure with the HTTP status the route should answer with. */
export class IssueActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "IssueActionError";
    this.status = status;
  }
}

export const createLinkSchema = z
  .object({
    type: issueLinkTypeSchema,
    targetId: z.string().trim().min(1).max(120),
  })
  .strict();

export const watcherTargetSchema = z
  .object({
    userId: z.string().trim().min(1).max(120).optional(),
    memberId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const INVERSE_TYPES = new Set<IssueLinkType>([
  "IS_BLOCKED_BY",
  "IS_DUPLICATED_BY",
  "IS_CLONED_BY",
]);

/**
 * Every relationship is stored once in its outward direction: "A is blocked
 * by B" is persisted as "B blocks A".
 */
export function canonicalLink(
  issueId: string,
  otherId: string,
  type: IssueLinkType,
): { sourceId: string; targetId: string; type: IssueLinkType } {
  if (INVERSE_TYPES.has(type)) {
    return {
      sourceId: otherId,
      targetId: issueId,
      type: inverseLinkType(type) as IssueLinkType,
    };
  }
  return { sourceId: issueId, targetId: otherId, type };
}

/** Describes a stored link as seen from one side of it. */
export function linkLabelFrom(
  viewerId: string,
  link: { sourceId: string; targetId: string; type: string },
) {
  const type =
    link.sourceId === viewerId ? link.type : inverseLinkType(link.type);
  const otherId = link.sourceId === viewerId ? link.targetId : link.sourceId;
  return `${LINK_TYPE_LABELS[type as IssueLinkType] ?? type} ${otherId}`;
}

export async function addIssueLink(
  issueId: string,
  input: z.infer<typeof createLinkSchema>,
  actor: WorkspaceActor,
) {
  if (input.targetId === issueId) {
    throw new IssueActionError("An issue cannot be linked to itself");
  }

  const found = await prisma.issue.findMany({
    where: {
      id: { in: [issueId, input.targetId] },
      organizationId: actor.organizationId,
      deletedAt: null,
    },
    select: { id: true, projectId: true },
  });
  if (found.length !== 2) {
    if (!found.some((issue) => issue.id === issueId)) return null;
    throw new IssueActionError("The issue to link was not found");
  }
  // Linking across projects needs view access to both sides.
  const user = actorAccessUser(actor);
  const target = found.find((issue) => issue.id === input.targetId)!;
  if (
    user &&
    !(await projectPermission(target.projectId, user, actor.organizationId)).canView
  ) {
    throw new IssueActionError("The issue to link was not found");
  }

  const link = canonicalLink(issueId, input.targetId, input.type);
  const duplicate = await prisma.issueLink.findFirst({
    where: {
      OR: [
        link,
        ...(link.type === "RELATES_TO"
          ? [
              {
                sourceId: link.targetId,
                targetId: link.sourceId,
                type: link.type,
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new IssueActionError("These issues are already linked that way", 409);
  }

  await prisma.$transaction([
    prisma.issueLink.create({ data: link }),
    prisma.activity.createMany({
      data: [link.sourceId, link.targetId].map((viewerId) => ({
        issueId: viewerId,
        type: "LINK_ADDED",
        description: `linked this issue: ${linkLabelFrom(viewerId, link)}`,
        actor: actor.name,
        actorId: actor.id,
      })),
    }),
  ]);

  return getIssue(issueId, actor.organizationId, actorAccessUser(actor));
}

export async function removeIssueLink(
  issueId: string,
  linkId: string,
  actor: WorkspaceActor,
) {
  const link = await prisma.issueLink.findFirst({
    where: {
      id: linkId,
      OR: [{ sourceId: issueId }, { targetId: issueId }],
      source: { organizationId: actor.organizationId },
    },
  });
  if (!link) return null;

  await prisma.$transaction([
    prisma.issueLink.delete({ where: { id: link.id } }),
    prisma.activity.createMany({
      data: [link.sourceId, link.targetId].map((viewerId) => ({
        issueId: viewerId,
        type: "LINK_REMOVED",
        description: `removed the link: ${linkLabelFrom(viewerId, link)}`,
        actor: actor.name,
        actorId: actor.id,
      })),
    }),
  ]);

  return getIssue(issueId, actor.organizationId, actorAccessUser(actor));
}

async function requireIssue(issueId: string, organizationId: string) {
  return prisma.issue.findFirst({
    where: { id: issueId, organizationId },
    select: { id: true, creatorId: true, status: true },
  });
}

export async function listWatchers(
  issueId: string,
  organizationId: string,
): Promise<WatcherSummary[] | null> {
  const issue = await requireIssue(issueId, organizationId);
  if (!issue) return null;

  const watchers = await prisma.issueWatcher.findMany({
    where: { issueId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const members = await prisma.member.findMany({
    where: {
      organizationId,
      userId: { in: watchers.map((watcher) => watcher.userId) },
    },
    select: { id: true, userId: true },
  });
  const memberByUser = new Map(
    members.map((member) => [member.userId, member.id]),
  );

  return watchers.map((watcher) => ({
    userId: watcher.userId,
    memberId: memberByUser.get(watcher.userId) ?? null,
    name: watcher.user.name,
    email: watcher.user.email,
  }));
}

/** Resolves a watcher target (member or user id) to a user in this org. */
async function resolveWatcherUserId(
  target: z.infer<typeof watcherTargetSchema>,
  actor: WorkspaceActor,
) {
  if (!target.userId && !target.memberId) return actor.id;

  const member = await prisma.member.findFirst({
    where: {
      organizationId: actor.organizationId,
      ...(target.memberId ? { id: target.memberId } : { userId: target.userId }),
    },
    select: { userId: true },
  });
  if (!member) {
    throw new IssueActionError("That person is not a member of this workspace");
  }
  return member.userId;
}

export async function setWatching(
  issueId: string,
  target: z.infer<typeof watcherTargetSchema>,
  watching: boolean,
  actor: WorkspaceActor,
  role: string,
) {
  const issue = await requireIssue(issueId, actor.organizationId);
  if (!issue) return null;

  const userId = await resolveWatcherUserId(target, actor);
  if (userId !== actor.id && role === "viewer") {
    throw new IssueActionError(
      "Viewers can only change their own watch status",
      403,
    );
  }
  if (userId !== actor.id && watching) {
    // Adding someone else needs edit rights, and they must be able to see it.
    await assertIssuePermission(
      issueId,
      { id: actor.id, role },
      actor.organizationId,
      "edit",
    );
    const member = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: actor.organizationId,
          userId,
        },
      },
      select: { role: true },
    });
    const canView = member
      ? await assertIssuePermission(
          issueId,
          { id: userId, role: member.role },
          actor.organizationId,
          "view",
        ).then(
          () => true,
          () => false,
        )
      : false;
    if (!canView) {
      throw new IssueActionError(
        "That person can't see this work item, so they can't watch it",
        400,
      );
    }
  }

  if (watching) {
    await prisma.issueWatcher.upsert({
      where: { issueId_userId: { issueId, userId } },
      create: { issueId, userId },
      update: {},
    });
  } else {
    await prisma.issueWatcher.deleteMany({ where: { issueId, userId } });
  }

  return {
    watchers: (await listWatchers(issueId, actor.organizationId)) ?? [],
    issue: await getIssue(issueId, actor.organizationId, actorAccessUser(actor)),
  };
}

export async function setVote(
  issueId: string,
  voting: boolean,
  actor: WorkspaceActor,
) {
  const issue = await requireIssue(issueId, actor.organizationId);
  if (!issue) return null;

  if (voting) {
    if (issue.creatorId === actor.id) {
      throw new IssueActionError("You cannot vote for an issue you reported");
    }
    if (isDoneStatus(issue.status)) {
      throw new IssueActionError("You cannot vote for a resolved issue");
    }
    await prisma.issueVote.upsert({
      where: { issueId_userId: { issueId, userId: actor.id } },
      create: { issueId, userId: actor.id },
      update: {},
    });
  } else {
    await prisma.issueVote.deleteMany({
      where: { issueId, userId: actor.id },
    });
  }

  return getIssue(issueId, actor.organizationId, actorAccessUser(actor));
}

export async function recordIssueView(issueId: string, actor: WorkspaceActor) {
  const issue = await requireIssue(issueId, actor.organizationId);
  if (!issue) return false;

  await prisma.issueView.upsert({
    where: { issueId_userId: { issueId, userId: actor.id } },
    create: { issueId, userId: actor.id, viewedAt: new Date() },
    update: { viewedAt: new Date() },
  });
  return true;
}
