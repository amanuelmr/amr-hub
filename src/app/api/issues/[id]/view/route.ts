import { NextRequest, NextResponse } from "next/server";
import { issueGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import { recordIssueView } from "../../../../../server/issueRelations";
import {
  actorFromSession,
  requireWorkspaceSession,
} from "../../../../../server/session";
import {
  issueNotFound,
  routeError,
  type IssueRouteContext,
} from "../_lib/routeErrors";

export async function POST(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "view");
    if (denied) return denied;
    const recorded = await recordIssueView(
      id,
      actorFromSession(result.session),
    );
    if (!recorded) return issueNotFound();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(
      error,
      "Failed to record issue view",
      "Issue view could not be recorded",
    );
  }
}
