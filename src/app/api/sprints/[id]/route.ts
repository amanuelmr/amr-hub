import { NextRequest, NextResponse } from "next/server";
import { updateSprintSchema } from "../../../../server/projectSchemas";
import { deleteSprint, updateSprint } from "../../../../server/sprints";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../server/session";
import { sprintErrorResponse, validationError } from "../respond";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = updateSprintSchema.safeParse(await request.json());
    if (!validation.success) return validationError(validation.error);
    const { id } = await context.params;

    return NextResponse.json(
      await updateSprint(id, validation.data, actorFromSession(result.session)),
    );
  } catch (error) {
    return sprintErrorResponse(error, "update");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    return NextResponse.json(
      await deleteSprint(id, actorFromSession(result.session)),
    );
  } catch (error) {
    return sprintErrorResponse(error, "delete");
  }
}
