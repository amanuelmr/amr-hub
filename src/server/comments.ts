import prisma from "../../prisma/client";
import { getIssue, type WorkspaceActor } from "./issues";
import { IssueActionError } from "./issueRelations";

export function canEditComment(authorId: string | null, actorId: string) {
  return authorId !== null && authorId === actorId;
}

export function canDeleteComment(
  authorId: string | null,
  actorId: string,
  role: string,
) {
  return role === "owner" || canEditComment(authorId, actorId);
}

async function findComment(
  issueId: string,
  commentId: string,
  organizationId: string,
) {
  return prisma.comment.findFirst({
    where: { id: commentId, issueId, issue: { organizationId } },
    select: { id: true, authorId: true },
  });
}

export async function editComment(
  issueId: string,
  commentId: string,
  body: string,
  actor: WorkspaceActor,
) {
  const comment = await findComment(issueId, commentId, actor.organizationId);
  if (!comment) return null;
  if (!canEditComment(comment.authorId, actor.id)) {
    throw new IssueActionError("You can only edit your own comments", 403);
  }

  await prisma.comment.update({
    where: { id: comment.id },
    data: { body, editedAt: new Date() },
  });
  return getIssue(issueId, actor.organizationId);
}

export async function deleteComment(
  issueId: string,
  commentId: string,
  actor: WorkspaceActor,
  role: string,
) {
  const comment = await findComment(issueId, commentId, actor.organizationId);
  if (!comment) return null;
  if (!canDeleteComment(comment.authorId, actor.id, role)) {
    throw new IssueActionError(
      "Only the author or a workspace owner can delete this comment",
      403,
    );
  }

  await prisma.comment.delete({ where: { id: comment.id } });
  return getIssue(issueId, actor.organizationId);
}
