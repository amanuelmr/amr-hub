import prisma from "../../prisma/client";
import { visibleIssueWhere, type AccessUser } from "./projectAccess";

export type LiveChange = {
  id: string;
  updatedAt: string;
  /** Who made the latest change, when it can be attributed. */
  actorId: string | null;
  actorName: string | null;
};

export type LiveResponse = {
  /** Server time to pass as `since` on the next poll. */
  now: string;
  changes: LiveChange[];
  /** Ids from `ids` that no longer exist in the workspace. */
  deleted: string[];
};

const MAX_CHANGES = 200;
/** Never scan further back than this, whatever `since` says. */
const MAX_WINDOW_MS = 60 * 60 * 1000;

type Attribution = { at: number; actorId: string | null; actorName: string };

function latest(
  map: Map<string, Attribution>,
  issueId: string,
  candidate: Attribution,
) {
  const current = map.get(issueId);
  if (!current || candidate.at > current.at) map.set(issueId, candidate);
}

/**
 * Issues in the workspace that changed after `since` (fields, comments,
 * reactions or activity), plus which of `knownIds` were deleted. Backs the
 * 10s live-refresh poll; org-scoped by construction.
 */
export async function listLiveChanges(
  organizationId: string,
  sinceInput: Date | null,
  knownIds: string[],
  viewer: AccessUser,
): Promise<LiveResponse> {
  const now = new Date();
  const response: LiveResponse = {
    now: now.toISOString(),
    changes: [],
    deleted: [],
  };

  if (knownIds.length > 0) {
    const existing = await prisma.issue.findMany({
      // Trashed, archived or newly hidden issues read as deleted.
      where: {
        id: { in: knownIds },
        ...visibleIssueWhere(viewer, organizationId, { includeArchivedProjects: true }),
      },
      select: { id: true },
    });
    const present = new Set(existing.map((issue) => issue.id));
    response.deleted = knownIds.filter((id) => !present.has(id));
  }

  if (!sinceInput) return response;
  const since = new Date(
    Math.max(sinceInput.getTime(), now.getTime() - MAX_WINDOW_MS),
  );

  const issues = await prisma.issue.findMany({
    where: {
      ...visibleIssueWhere(viewer, organizationId, { includeArchivedProjects: true }),
      OR: [
        { updatedAt: { gt: since } },
        { activity: { some: { createdAt: { gt: since } } } },
        { comments: { some: { createdAt: { gt: since } } } },
        { comments: { some: { editedAt: { gt: since } } } },
        {
          comments: {
            some: { reactions: { some: { createdAt: { gt: since } } } },
          },
        },
      ],
    },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: MAX_CHANGES,
  });
  if (issues.length === 0) return response;

  const ids = issues.map((issue) => issue.id);
  const [activity, comments, reactions] = await Promise.all([
    prisma.activity.findMany({
      where: { issueId: { in: ids }, createdAt: { gt: since } },
      select: { issueId: true, actor: true, actorId: true, createdAt: true },
    }),
    prisma.comment.findMany({
      where: {
        issueId: { in: ids },
        OR: [{ createdAt: { gt: since } }, { editedAt: { gt: since } }],
      },
      select: {
        issueId: true,
        author: true,
        authorId: true,
        createdAt: true,
        editedAt: true,
      },
    }),
    prisma.commentReaction.findMany({
      where: { comment: { issueId: { in: ids } }, createdAt: { gt: since } },
      select: {
        userId: true,
        createdAt: true,
        user: { select: { name: true } },
        comment: { select: { issueId: true } },
      },
    }),
  ]);

  const actors = new Map<string, Attribution>();
  for (const event of activity) {
    latest(actors, event.issueId, {
      at: event.createdAt.getTime(),
      actorId: event.actorId,
      actorName: event.actor,
    });
  }
  for (const comment of comments) {
    latest(actors, comment.issueId, {
      at: (comment.editedAt ?? comment.createdAt).getTime(),
      actorId: comment.authorId,
      actorName: comment.author,
    });
  }
  for (const reaction of reactions) {
    latest(actors, reaction.comment.issueId, {
      at: reaction.createdAt.getTime(),
      actorId: reaction.userId,
      actorName: reaction.user.name,
    });
  }

  response.changes = issues.map((issue) => {
    const actor = actors.get(issue.id);
    return {
      id: issue.id,
      updatedAt: issue.updatedAt.toISOString(),
      actorId: actor?.actorId ?? null,
      actorName: actor?.actorName ?? null,
    };
  });
  return response;
}
