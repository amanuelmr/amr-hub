import { NextResponse } from "next/server";
import { createProjectSchema } from "../../../server/projectSchemas";
import {
  createProject,
  DuplicateProjectKeyError,
  DuplicateProjectNameError,
  listProjects,
} from "../../../server/projects";
import {
  actorFromSession,
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../server/session";
import { errorResponse, validationFailed } from "./http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    return NextResponse.json(
      await listProjects(session.workspace.id, session.user.id),
    );
  } catch (error) {
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
    return errorResponse(
      error,
      "Project could not be created",
      [],
      [DuplicateProjectKeyError, DuplicateProjectNameError],
    );
  }
}
