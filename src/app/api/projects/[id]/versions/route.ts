import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../server/projectAccess";
import {
  createVersion,
  createVersionSchema,
  DuplicateVersionNameError,
  InvalidDriverError,
  listVersions,
} from "../../../../../server/versions";
import {
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "view");
    if (guard) return guard;
    const versions = await listVersions(id, session.workspace.id);
    return versions ? NextResponse.json(versions) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Versions could not be loaded");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createVersionSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);

    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "edit");
    if (guard) return guard;
    const version = await createVersion(
      id,
      validation.data,
      session.workspace.id,
    );
    return version
      ? NextResponse.json(version, { status: 201 })
      : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(
      error,
      "Version could not be created",
      [InvalidDriverError],
      [DuplicateVersionNameError],
    );
  }
}
