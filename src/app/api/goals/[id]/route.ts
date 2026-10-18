import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, accessUserFromSession } from "../../../../server/projectAccess";
import { deleteGoal, getGoal, GoalInputError, updateGoal } from "../../../../server/goals";
import { updateGoalSchema } from "../../../../server/goalSchemas";
import { requireWorkspaceRole, requireWorkspaceSession } from "../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../projects/http";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const goal = await getGoal(
      id,
      result.session.workspace.id,
      accessUserFromSession(result.session),
    );
    return goal ? NextResponse.json(goal) : notFound("Goal");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Goal could not be loaded");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = updateGoalSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const goal = await updateGoal(
      id,
      validation.data,
      result.session.workspace.id,
      accessUserFromSession(result.session),
    );
    return goal ? NextResponse.json(goal) : notFound("Goal");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Goal could not be updated", [GoalInputError]);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const deleted = await deleteGoal(id, result.session.workspace.id);
    return deleted ? new NextResponse(null, { status: 204 }) : notFound("Goal");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Goal could not be deleted");
  }
}
