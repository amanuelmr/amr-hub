import { NextRequest, NextResponse } from "next/server";
import {
  BoardInputError,
  deleteBoard,
  listBoards,
  updateBoard,
  updateBoardSchema,
} from "../../../../../../server/boards";
import { projectGuard } from "../../../../../../server/projectAccess";
import { requireWorkspaceRole } from "../../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = { params: Promise<{ id: string; boardId: string }> };

/** Rename, refilter or reconfigure a board (project admins). */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id, boardId } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;
    const validation = updateBoardSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const updated = await updateBoard(id, boardId, validation.data, session.workspace.id);
    if (!updated) return notFound("Board");
    return NextResponse.json(await listBoards(id, session.workspace.id));
  } catch (error) {
    return errorResponse(error, "Board could not be updated", [BoardInputError]);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id, boardId } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;
    const deleted = await deleteBoard(id, boardId, session.workspace.id);
    return deleted ? new NextResponse(null, { status: 204 }) : notFound("Board");
  } catch (error) {
    return errorResponse(error, "Board could not be deleted", [BoardInputError]);
  }
}
