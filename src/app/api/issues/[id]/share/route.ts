import { NextRequest, NextResponse } from "next/server";
import { shareIssue, shareIssueSchema } from "../../../../../server/issueShare";
import {
  actorFromSession,
  requireWorkspaceSession,
} from "../../../../../server/session";
import {
  issueNotFound,
  routeError,
  validationFailed,
  type IssueRouteContext,
} from "../_lib/routeErrors";

/**
 * POST { userIds?: string[], memberIds?: string[], message?: string }
 * Sends an ISSUE_SHARED notification to each teammate. Anyone who can see the
 * issue (viewers included) may share it, as in Jira.
 */
export async function POST(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const validation = shareIssueSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const shared = await shareIssue(
      id,
      validation.data,
      actorFromSession(result.session),
    );
    if (!shared) return issueNotFound();
    return NextResponse.json(shared);
  } catch (error) {
    return routeError(error, "Failed to share issue", "Issue could not be shared");
  }
}
