import { NextRequest, NextResponse } from "next/server";
import { createGoal, GoalInputError, listGoalPeople, listGoals } from "../../../server/goals";
import { createGoalSchema } from "../../../server/goalSchemas";
import { requireWorkspaceRole, requireWorkspaceSession } from "../../../server/session";
import { errorResponse, validationFailed } from "../projects/http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const organizationId = result.session.workspace.id;

  try {
    const [goals, people] = await Promise.all([
      listGoals(organizationId),
      listGoalPeople(organizationId),
    ]);
    return NextResponse.json({ goals, people });
  } catch (error) {
    return errorResponse(error, "Goals could not be loaded");
  }
}

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = createGoalSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const goal = await createGoal(validation.data, result.session.workspace.id);
    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Goal could not be created", [GoalInputError]);
  }
}
