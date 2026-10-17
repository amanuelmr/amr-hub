import { NextResponse } from "next/server";
import { teamMembersSchema } from "../../../../../server/teamSchemas";
import { addTeamMembers, removeTeamMembers } from "../../../../../server/teams";
import {
  teamErrorResponse,
  teamNotFound,
  teamViewer,
  validationFailed,
} from "../../../../../server/teamsHttp";
import { requireWorkspaceRole } from "../../../../../server/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

async function change(
  request: Request,
  context: RouteContext,
  action: typeof addTeamMembers,
  fallback: string,
) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;

  try {
    const validation = teamMembersSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const team = await action(
      id,
      session.workspace.id,
      validation.data.userIds,
      teamViewer(session),
    );
    return team ? NextResponse.json(team) : teamNotFound();
  } catch (error) {
    return teamErrorResponse(error, fallback);
  }
}

/** POST { userIds } adds people to the team. */
export function POST(request: Request, context: RouteContext) {
  return change(request, context, addTeamMembers, "Team members could not be added");
}

/** DELETE { userIds } removes people from the team. */
export function DELETE(request: Request, context: RouteContext) {
  return change(request, context, removeTeamMembers, "Team members could not be removed");
}
