import { NextRequest, NextResponse } from "next/server";
import {
  deleteWorklog,
  updateWorklog,
  updateWorklogSchema,
} from "../../../../../../server/worklogs";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../../server/session";
import {
  issueNotFound,
  routeError,
  validationFailed,
} from "../../_lib/routeErrors";

type RouteContext = {
  params: Promise<{ id: string; worklogId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = updateWorklogSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id, worklogId } = await context.params;
    const response = await updateWorklog(
      id,
      worklogId,
      validation.data,
      actorFromSession(result.session),
    );
    if (!response) return issueNotFound("Work log not found");
    return NextResponse.json(response);
  } catch (error) {
    return routeError(
      error,
      "Failed to update work log",
      "Work log could not be updated",
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const { id, worklogId } = await context.params;
    const issue = await deleteWorklog(
      id,
      worklogId,
      actorFromSession(result.session),
      result.session.workspace.role,
    );
    if (!issue) return issueNotFound("Work log not found");
    return NextResponse.json(issue);
  } catch (error) {
    return routeError(
      error,
      "Failed to delete work log",
      "Work log could not be deleted",
    );
  }
}
