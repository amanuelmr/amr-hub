import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../server/projectAccess";
import { setProjectStar } from "../../../../../server/projects";
import { requireWorkspaceSession } from "../../../../../server/session";
import { errorResponse, notFound } from "../../http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function toggleStar(
  request: NextRequest,
  context: RouteContext,
  starred: boolean,
) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "view");
    if (guard) return guard;
    const star = await setProjectStar(
      id,
      session.user.id,
      session.workspace.id,
      starred,
    );
    return star ? NextResponse.json(star) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Project star could not be updated");
  }
}

export function POST(request: NextRequest, context: RouteContext) {
  return toggleStar(request, context, true);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return toggleStar(request, context, false);
}
