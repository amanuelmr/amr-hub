import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, accessUserFromSession } from "../../../../../server/projectAccess";
import { GoalInputError, linkGoalIssues, unlinkGoalIssue } from "../../../../../server/goals";
import { linkGoalIssuesSchema } from "../../../../../server/goalSchemas";
import { requireWorkspaceRole } from "../../../../../server/session";
import { errorResponse, notFound, RequestError, validationFailed } from "../../../projects/http";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** Link work items to the goal (sets Issue.goalId; an item belongs to one goal). */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = linkGoalIssuesSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const goal = await linkGoalIssues(
      id,
      validation.data.issueIds,
      result.session.workspace.id,
      accessUserFromSession(result.session),
    );
    return goal ? NextResponse.json(goal) : notFound("Goal");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Work items could not be linked", [GoalInputError]);
  }
}

/** Unlink one work item: DELETE /api/goals/:id/issues?issueId=KEY-1 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const issueId = request.nextUrl.searchParams.get("issueId")?.trim();
    if (!issueId) throw new RequestError("issueId is required");
    const { id } = await context.params;
    const goal = await unlinkGoalIssue(
      id,
      issueId,
      result.session.workspace.id,
      accessUserFromSession(result.session),
    );
    return goal ? NextResponse.json(goal) : notFound("Goal");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Work item could not be unlinked");
  }
}
