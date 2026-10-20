import { NextRequest, NextResponse } from "next/server";
import { issueGuard, accessErrorResponse } from "../../../../../../../server/projectAccess";
import { setCommentReaction } from "../../../../../../../server/reactions";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../../../server/session";
import {
  issueNotFound,
  readJsonBody,
  routeError,
} from "../../../_lib/routeErrors";

type RouteContext = {
  params: Promise<{ id: string; commentId: string }>;
};

async function changeReaction(
  request: NextRequest,
  context: RouteContext,
  reacting: boolean,
) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const body = (await readJsonBody(request)) as { emoji?: unknown } | null;
    const emoji =
      body?.emoji ?? request.nextUrl.searchParams.get("emoji") ?? undefined;
    const { id, commentId } = await context.params;
    const denied = await issueGuard(result.session, id, "comment");
    if (denied) return denied;
    const issue = await setCommentReaction(
      id,
      commentId,
      emoji,
      reacting,
      actorFromSession(result.session),
    );
    if (!issue) return issueNotFound("Comment not found");
    return NextResponse.json(issue);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(
      error,
      "Failed to update reaction",
      "Reaction could not be saved",
    );
  }
}

/** POST { emoji } adds the signed-in user's reaction. */
export function POST(request: NextRequest, context: RouteContext) {
  return changeReaction(request, context, true);
}

/** DELETE { emoji } (or ?emoji=) removes it. */
export function DELETE(request: NextRequest, context: RouteContext) {
  return changeReaction(request, context, false);
}
