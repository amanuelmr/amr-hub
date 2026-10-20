import { NextRequest, NextResponse } from "next/server";
import { issueGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import {
  createWorklog,
  createWorklogSchema,
  listWorklogs,
} from "../../../../../server/worklogs";
import {
  actorFromSession,
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../../../server/session";
import {
  issueNotFound,
  routeError,
  validationFailed,
  type IssueRouteContext,
} from "../_lib/routeErrors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "view");
    if (denied) return denied;
    const worklogs = await listWorklogs(id, result.session.workspace.id);
    if (!worklogs) return issueNotFound();
    return NextResponse.json(worklogs);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(
      error,
      "Failed to load work logs",
      "Work logs could not be loaded",
    );
  }
}

export async function POST(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = createWorklogSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "edit");
    if (denied) return denied;
    const response = await createWorklog(
      id,
      validation.data,
      actorFromSession(result.session),
    );
    if (!response) return issueNotFound();
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(error, "Failed to log work", "Work could not be logged");
  }
}
