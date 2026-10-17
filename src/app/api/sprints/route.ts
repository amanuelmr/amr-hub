import { NextRequest, NextResponse } from "next/server";
import { createSprintSchema } from "../../../server/projectSchemas";
import { listCycles } from "../../../server/cycles";
import { createSprint } from "../../../server/sprints";
import {
  actorFromSession,
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../server/session";
import { sprintErrorResponse, validationError } from "./respond";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;

  try {
    return NextResponse.json(
      await listCycles(result.session.workspace.id, projectId),
    );
  } catch (error) {
    console.error("Failed to load sprints", error);
    return NextResponse.json(
      { error: "Sprints could not be loaded" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = createSprintSchema.safeParse(await request.json());
    if (!validation.success) return validationError(validation.error);

    return NextResponse.json(
      await createSprint(validation.data, actorFromSession(result.session)),
      { status: 201 },
    );
  } catch (error) {
    return sprintErrorResponse(error, "create");
  }
}
