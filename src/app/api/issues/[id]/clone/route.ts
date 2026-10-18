import { isWorkflowValidationError } from "../../../../../server/workflows";
import { issueGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import { NextRequest, NextResponse } from "next/server";
import {
  InvalidParentError,
  UnknownAssigneeError,
  UnknownComponentError,
  UnknownCycleError,
  UnknownLabelError,
  UnknownVersionError,
} from "../../../../../server/issues";
import {
  cloneIssue,
  cloneIssueSchema,
} from "../../../../../server/issueOperations";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../server/session";
import {
  issueNotFound,
  readJsonBody,
  routeError,
  validationFailed,
  type IssueRouteContext,
} from "../_lib/routeErrors";

export async function POST(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = cloneIssueSchema.safeParse(await readJsonBody(request));
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "edit");
    if (denied) return denied;
    const issue = await cloneIssue(
      id,
      validation.data,
      actorFromSession(result.session),
    );
    if (!issue) return issueNotFound();
    return NextResponse.json(issue, { status: 201 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (
      error instanceof UnknownLabelError ||
      error instanceof UnknownCycleError ||
      error instanceof UnknownAssigneeError ||
      error instanceof InvalidParentError ||
      error instanceof UnknownVersionError ||
      error instanceof UnknownComponentError ||
      isWorkflowValidationError(error)
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return routeError(error, "Failed to clone issue", "Issue could not be cloned");
  }
}
