import { NextRequest, NextResponse } from "next/server";
import {
  commentBodySchema,
  deleteComment,
  editComment,
} from "../../../../../../server/comments";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../../server/session";
import {
  issueNotFound,
  routeError,
  validationFailed,
} from "../../_lib/routeErrors";

type RouteContext = {
  params: Promise<{ id: string; commentId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = commentBodySchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id, commentId } = await context.params;
    const issue = await editComment(
      id,
      commentId,
      validation.data.body,
      actorFromSession(result.session),
    );
    if (!issue) return issueNotFound("Comment not found");
    return NextResponse.json(issue);
  } catch (error) {
    return routeError(
      error,
      "Failed to edit comment",
      "Comment could not be updated",
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const { id, commentId } = await context.params;
    const issue = await deleteComment(
      id,
      commentId,
      actorFromSession(result.session),
      result.session.workspace.role,
    );
    if (!issue) return issueNotFound("Comment not found");
    return NextResponse.json(issue);
  } catch (error) {
    return routeError(
      error,
      "Failed to delete comment",
      "Comment could not be deleted",
    );
  }
}
