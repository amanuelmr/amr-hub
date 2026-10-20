import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../server/projectAccess";
import { requireWorkspaceSession } from "../../../../../server/session";
import { getProjectWorkflow } from "../../../../../server/workflows";
import { errorResponse, notFound } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "view");
    if (guard) return guard;
    const workflow = await getProjectWorkflow(id, result.session.workspace.id);
    return workflow ? NextResponse.json(workflow) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Workflow could not be loaded");
  }
}
