import { NextResponse } from "next/server";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../server/session";
import { purgeProject, restoreProject } from "../../../../../server/trash";
import { trashErrorResponse } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

const ownersOnly = () =>
  NextResponse.json(
    { error: "Only workspace owners can manage trashed projects" },
    { status: 403 },
  );

/** Restores a trashed project. */
export async function POST(request: Request, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"], ownersOnly);
  if ("response" in result) return result.response;
  try {
    const { id } = await context.params;
    await restoreProject(id, actorFromSession(result.session));
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return trashErrorResponse(error, "Project could not be restored");
  }
}

/** Permanently deletes a trashed project and all its work. */
export async function DELETE(request: Request, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"], ownersOnly);
  if ("response" in result) return result.response;
  try {
    const { id } = await context.params;
    await purgeProject(id, actorFromSession(result.session));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return trashErrorResponse(error, "Project could not be deleted");
  }
}
