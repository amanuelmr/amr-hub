import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../server/projectAccess";
import { listProjectAttachments } from "../../../../../server/attachments";
import { requireWorkspaceSession } from "../../../../../server/session";
import { errorResponse, notFound } from "../../http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "view");
    if (guard) return guard;
    const attachments = await listProjectAttachments(id, session.workspace.id);
    return attachments ? NextResponse.json(attachments) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Attachments could not be loaded");
  }
}
