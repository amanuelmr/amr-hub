import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, accessUserFromSession } from "../../../../../server/projectAccess";
import { addGoalUpdate } from "../../../../../server/goals";
import { createGoalUpdateSchema } from "../../../../../server/goalSchemas";
import { requireWorkspaceRole } from "../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../projects/http";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createGoalUpdateSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const goal = await addGoalUpdate(
      id,
      validation.data,
      session.user.id,
      session.workspace.id,
      accessUserFromSession(session),
    );
    return goal ? NextResponse.json(goal, { status: 201 }) : notFound("Goal");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Status update could not be posted");
  }
}
