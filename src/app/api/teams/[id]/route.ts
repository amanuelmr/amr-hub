import { NextResponse } from "next/server";
import { updateTeamSchema } from "../../../../server/teamSchemas";
import { deleteTeam, getTeam, updateTeam } from "../../../../server/teams";
import {
  teamErrorResponse,
  teamNotFound,
  teamViewer,
  validationFailed,
} from "../../../../server/teamsHttp";
import {
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../../server/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;

  try {
    const team = await getTeam(id, session.workspace.id, teamViewer(session));
    return team ? NextResponse.json(team) : teamNotFound();
  } catch (error) {
    return teamErrorResponse(error, "Team could not be loaded");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;

  try {
    const validation = updateTeamSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const team = await updateTeam(
      id,
      session.workspace.id,
      validation.data,
      teamViewer(session),
    );
    return team ? NextResponse.json(team) : teamNotFound();
  } catch (error) {
    return teamErrorResponse(error, "Team could not be updated");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;

  try {
    const deleted = await deleteTeam(id, session.workspace.id, teamViewer(session));
    return deleted ? new NextResponse(null, { status: 204 }) : teamNotFound();
  } catch (error) {
    return teamErrorResponse(error, "Team could not be deleted");
  }
}
