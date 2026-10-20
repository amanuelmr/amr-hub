import { NextRequest, NextResponse } from "next/server";
import {
  BoardInputError,
  createBoard,
  createBoardSchema,
  listBoards,
} from "../../../../../server/boards";
import { projectGuard } from "../../../../../server/projectAccess";
import {
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "view");
    if (denied) return denied;
    const boards = await listBoards(id, session.workspace.id);
    return boards ? NextResponse.json(boards) : notFound("Project");
  } catch (error) {
    return errorResponse(error, "Boards could not be loaded");
  }
}

/** Create an extra board (project admins). */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;
    const validation = createBoardSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const boardId = await createBoard(id, validation.data, session.workspace.id);
    if (!boardId) return notFound("Project");
    const boards = await listBoards(id, session.workspace.id);
    return NextResponse.json(
      { id: boardId, boards },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, "Board could not be created", [BoardInputError]);
  }
}
