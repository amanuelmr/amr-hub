import { isWorkflowValidationError } from "../../../../server/workflows";
import { NextRequest, NextResponse } from "next/server";
import { updateIssueSchema } from "../../../../server/issueSchemas";
import { deleteIssue } from "../../../../server/issueOperations";
import { IssueActionError } from "../../../../server/issueRelations";
import {
  getIssue,
  resolveIssueKey,
  InvalidParentError,
  UnknownAssigneeError,
  UnknownComponentError,
  UnknownCycleError,
  UnknownLabelError,
  UnknownVersionError,
  UnknownTeamError,
  UnknownGoalError,
  updateIssue,
} from "../../../../server/issues";
import {
  actorFromSession,
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../../server/session";
import {
  accessErrorResponse,
  accessUserFromSession,
} from "../../../../server/projectAccess";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { id } = await context.params;

  try {
    // A key from before a project was renamed loads the item under its new key.
    const currentId = await resolveIssueKey(id, result.session.workspace.id);
    const issue = await getIssue(
      currentId,
      result.session.workspace.id,
      accessUserFromSession(result.session),
    );
    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }
    return NextResponse.json(issue);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load issue", error);
    return NextResponse.json(
      { error: "Issue could not be loaded" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = updateIssueSchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const issue = await updateIssue(
      id,
      validation.data,
      actorFromSession(session),
    );

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    return NextResponse.json(issue);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    if (
      error instanceof UnknownLabelError ||
      error instanceof UnknownCycleError ||
      error instanceof UnknownAssigneeError ||
      error instanceof InvalidParentError ||
      error instanceof UnknownVersionError ||
      error instanceof UnknownComponentError ||
      error instanceof UnknownTeamError ||
      error instanceof UnknownGoalError ||
      isWorkflowValidationError(error)
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to update issue", error);
    return NextResponse.json(
      { error: "Issue could not be updated" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const deleted = await deleteIssue(
      id,
      actorFromSession(session),
      session.workspace.role,
    );
    if (!deleted) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof IssueActionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Failed to delete issue", error);
    return NextResponse.json(
      { error: "Issue could not be deleted" },
      { status: 500 },
    );
  }
}
