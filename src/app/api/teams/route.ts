import { NextResponse } from "next/server";
import { createTeamSchema } from "../../../server/teamSchemas";
import { createTeam, listTeams } from "../../../server/teams";
import {
  teamErrorResponse,
  teamViewer,
  validationFailed,
} from "../../../server/teamsHttp";
import {
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const url = new URL(request.url);
    const memberUserId = url.searchParams.get("member") ?? undefined;
    return NextResponse.json(
      await listTeams(session.workspace.id, teamViewer(session), { memberUserId }),
    );
  } catch (error) {
    return teamErrorResponse(error, "Teams could not be loaded");
  }
}

export async function POST(request: Request) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createTeamSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const team = await createTeam(
      session.workspace.id,
      validation.data,
      teamViewer(session),
    );
    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    return teamErrorResponse(error, "Team could not be created");
  }
}
