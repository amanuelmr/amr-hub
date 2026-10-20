import { NextRequest, NextResponse } from "next/server";
import { projectGuard } from "../../../../../server/projectAccess";
import { requireWorkspaceSession } from "../../../../../server/session";
import { listTrashedIssues, TRASH_RETENTION_DAYS } from "../../../../../server/trash";
import { errorResponse } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

/** The project's trashed work items (project admins). */
export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;
    return NextResponse.json({
      retentionDays: TRASH_RETENTION_DAYS,
      issues: await listTrashedIssues(session.workspace.id, { projectId: id }),
    });
  } catch (error) {
    return errorResponse(error, "Trash could not be loaded");
  }
}
