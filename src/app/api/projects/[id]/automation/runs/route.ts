import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../../server/projectAccess";
import { listAutomationRuns } from "../../../../../../server/automation";
import {
  RUN_STATUSES,
  type AutomationRunStatus,
} from "../../../../../../server/automationRules";
import { requireWorkspaceSession } from "../../../../../../server/session";
import { errorResponse, notFound } from "../../../http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** The project's automation audit log, newest first, with optional filters. */
export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "admin");
    if (guard) return guard;
    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    if (status && !RUN_STATUSES.includes(status as AutomationRunStatus)) {
      return NextResponse.json(
        { error: `status must be one of ${RUN_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    const limit = Number.parseInt(params.get("limit") ?? "", 10);
    const runs = await listAutomationRuns(id, session.workspace.id, {
      ruleId: params.get("ruleId") || undefined,
      status: (status as AutomationRunStatus | null) ?? undefined,
      issueId: params.get("issue") || undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor: params.get("cursor"),
    });
    return runs ? NextResponse.json(runs) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Automation audit log could not be loaded");
  }
}
