import { NextRequest, NextResponse } from "next/server";
import { createProjectSchema } from "../../../server/projectSchemas";
import {
  createProject,
  DuplicateProjectKeyError,
  DuplicateProjectNameError,
  listProjects,
} from "../../../server/projects";
import { accessUserFromSession, accessErrorResponse } from "../../../server/projectAccess";
import {
  actorFromSession,
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../server/session";
import { errorResponse, validationFailed } from "./http";

export const dynamic = "force-dynamic";

/** ?archived=only lists archived projects; ?archived=include lists all. */
export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  const archivedParam = request.nextUrl.searchParams.get("archived");
  const archived =
    archivedParam === "only" || archivedParam === "include"
      ? archivedParam
      : "exclude";

  try {
    return NextResponse.json(
      await listProjects(session.workspace.id, accessUserFromSession(session), {
        archived,
      }),
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Projects could not be loaded");
  }
}

export async function POST(request: Request) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createProjectSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);

    return NextResponse.json(
      await createProject(validation.data, actorFromSession(session)),
      { status: 201 },
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(
      error,
      "Project could not be created",
      [],
      [DuplicateProjectKeyError, DuplicateProjectNameError],
    );
  }
}
