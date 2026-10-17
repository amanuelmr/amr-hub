import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceSession } from "../../../../../server/session";
import { getProjectWorkflow } from "../../../../../server/workflows";
import { errorResponse, notFound } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const workflow = await getProjectWorkflow(id, result.session.workspace.id);
    return workflow ? NextResponse.json(workflow) : notFound("Project");
  } catch (error) {
    return errorResponse(error, "Workflow could not be loaded");
  }
}
