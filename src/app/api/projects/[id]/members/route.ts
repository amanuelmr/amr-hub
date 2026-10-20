import { NextRequest, NextResponse } from "next/server";
import { listProjectPeople } from "../../../../../server/projects";
import { projectGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import { requireWorkspaceSession } from "../../../../../server/session";
import { errorResponse } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

/** People who can be assigned or mentioned on this project. */
export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "view");
    if (denied) return denied;
    return NextResponse.json(await listProjectPeople(session.workspace.id, id));
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Members could not be loaded");
  }
}
