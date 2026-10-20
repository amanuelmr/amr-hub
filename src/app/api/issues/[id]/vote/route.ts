import { NextRequest, NextResponse } from "next/server";
import { issueGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import { setVote } from "../../../../../server/issueRelations";
import {
  actorFromSession,
  requireWorkspaceSession,
} from "../../../../../server/session";
import {
  issueNotFound,
  routeError,
  type IssueRouteContext,
} from "../_lib/routeErrors";

async function changeVote(
  request: NextRequest,
  context: IssueRouteContext,
  voting: boolean,
) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "view");
    if (denied) return denied;
    const issue = await setVote(id, voting, actorFromSession(result.session));
    if (!issue) return issueNotFound();
    return NextResponse.json(issue);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(error, "Failed to update vote", "Vote could not be saved");
  }
}

export function POST(request: NextRequest, context: IssueRouteContext) {
  return changeVote(request, context, true);
}

export function DELETE(request: NextRequest, context: IssueRouteContext) {
  return changeVote(request, context, false);
}
