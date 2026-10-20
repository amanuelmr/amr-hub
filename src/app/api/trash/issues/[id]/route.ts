import { NextResponse } from "next/server";
import { accessUserFromSession } from "../../../../../server/projectAccess";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../server/session";
import { purgeIssue, restoreIssue } from "../../../../../server/trash";
import { trashErrorResponse } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

/** Restores a trashed work item (and the subtasks trashed with it). */
export async function POST(request: Request, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    await restoreIssue(id, actorFromSession(session), accessUserFromSession(session));
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return trashErrorResponse(error, "Work item could not be restored");
  }
}

/** Permanently deletes a trashed work item. */
export async function DELETE(request: Request, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    await purgeIssue(id, actorFromSession(session), accessUserFromSession(session));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return trashErrorResponse(error, "Work item could not be deleted");
  }
}
