import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../../server/projectAccess";
import { completeSprintSchema } from "../../../../../server/projectSchemas";
import { completeSprint } from "../../../../../server/sprints";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../server/session";
import { sprintErrorResponse, validationError } from "../../respond";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = completeSprintSchema.safeParse(await request.json());
    if (!validation.success) return validationError(validation.error);
    const { id } = await context.params;

    return NextResponse.json(
      await completeSprint(id, validation.data, actorFromSession(result.session)),
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return sprintErrorResponse(error, "complete");
  }
}
