import prisma from "../../prisma/client";
import { isAllowedReaction } from "../app/data/reactions";
import { getIssue, type WorkspaceActor, actorAccessUser } from "./issues";
import { IssueActionError } from "./issueRelations";

/**
 * Adds or removes the actor's emoji reaction on a comment. Reacting twice
 * with the same emoji is a no-op, as is removing a reaction that is not there.
 * Returns the refreshed issue, or null when the comment is not in the org.
 */
export async function setCommentReaction(
  issueId: string,
  commentId: string,
  emoji: unknown,
  reacting: boolean,
  actor: WorkspaceActor,
) {
  if (!isAllowedReaction(emoji)) {
    throw new IssueActionError("Choose one of the available reactions", 400);
  }

  const comment = await prisma.comment.findFirst({
    where: {
      id: commentId,
      issueId,
      issue: { organizationId: actor.organizationId },
    },
    select: { id: true },
  });
  if (!comment) return null;

  if (reacting) {
    await prisma.commentReaction.upsert({
      where: {
        commentId_userId_emoji: { commentId, userId: actor.id, emoji },
      },
      create: { commentId, userId: actor.id, emoji },
      update: {},
    });
  } else {
    await prisma.commentReaction.deleteMany({
      where: { commentId, userId: actor.id, emoji },
    });
  }

  // Bump the issue so live views (GET /api/live) pick the change up.
  await prisma.issue.update({
    where: { id: issueId },
    data: { updatedAt: new Date() },
  });

  return getIssue(issueId, actor.organizationId, actorAccessUser(actor));
}
