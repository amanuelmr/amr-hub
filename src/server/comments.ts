import { z } from "zod";
import prisma from "../../prisma/client";
import { looksLikeHtml } from "../app/data/richText";
import { getIssue, type WorkspaceActor, actorAccessUser } from "./issues";
import { IssueActionError } from "./issueRelations";
import { hasRichContent, sanitizeCommentHtml, stripHtml } from "./richText";

/** Raw request body for creating or editing a comment. */
export const commentBodySchema = z
  .object({ body: z.string().max(100_000) })
  .strict();

const MAX_STORED_COMMENT = 50_000;

/**
 * Comments are rich HTML from the shared editor, sanitized here (the trust
 * boundary). Plain-text bodies (older clients, the public API) are kept as-is.
 * Returns the body to store, or throws a 400 when it is empty or too long.
 */
export function prepareCommentBody(raw: string): string {
  const trimmed = raw.trim();
  if (looksLikeHtml(trimmed)) {
    const html = sanitizeCommentHtml(trimmed);
    if (
      !hasRichContent(html) ||
      stripHtml(html).length + (html.includes("<img") ? 2 : 0) < 2
    ) {
      throw new IssueActionError("Write at least 2 characters", 400);
    }
    if (html.length > MAX_STORED_COMMENT) {
      throw new IssueActionError("This comment is too long", 400);
    }
    return html;
  }
  if (trimmed.length < 2) {
    throw new IssueActionError("Write at least 2 characters", 400);
  }
  if (trimmed.length > 10_000) {
    throw new IssueActionError("This comment is too long", 400);
  }
  return trimmed;
}

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

/** Bumps updatedAt so live views (GET /api/live) see comment changes. */
async function touchIssue(issueId: string) {
  await prisma.issue.update({
    where: { id: issueId },
    data: { updatedAt: new Date() },
  });
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
    data: { body: prepareCommentBody(body), editedAt: new Date() },
  });
  await touchIssue(issueId);
  return getIssue(issueId, actor.organizationId, actorAccessUser(actor));
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
  await touchIssue(issueId);
  return getIssue(issueId, actor.organizationId, actorAccessUser(actor));
}
