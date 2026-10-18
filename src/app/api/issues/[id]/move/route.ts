import { NextRequest, NextResponse } from "next/server";
import { issueGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import {
  moveIssue,
  moveIssueSchema,
} from "../../../../../server/issueOperations";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../server/session";
import {
  issueNotFound,
  routeError,
  validationFailed,
  type IssueRouteContext,
} from "../_lib/routeErrors";

export async function POST(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = moveIssueSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "edit");
    if (denied) return denied;
    const issue = await moveIssue(
      id,
      validation.data.projectId,
      actorFromSession(result.session),
    );
    if (!issue) return issueNotFound();
    return NextResponse.json(issue);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(error, "Failed to move issue", "Issue could not be moved");
  }
}
