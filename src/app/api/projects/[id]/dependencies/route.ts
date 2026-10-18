import { NextRequest, NextResponse } from "next/server";
import { listProjectDependencies } from "../../../../../server/dependencies";
import {
  accessUserFromSession,
  projectGuard,
} from "../../../../../server/projectAccess";
import { requireWorkspaceSession } from "../../../../../server/session";
import { errorResponse } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** Blocking dependencies between the project's work items. */
export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "view");
    if (denied) return denied;
    return NextResponse.json(
      await listProjectDependencies(
        id,
        accessUserFromSession(session),
        session.workspace.id,
      ),
    );
  } catch (error) {
    return errorResponse(error, "Dependencies could not be loaded");
  }
}
