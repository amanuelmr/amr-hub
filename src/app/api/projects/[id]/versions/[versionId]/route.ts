import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../../server/projectAccess";
import {
  deleteVersion,
  DuplicateVersionNameError,
  InvalidDriverError,
  InvalidTargetVersionError,
  updateVersion,
  updateVersionSchema,
} from "../../../../../../server/versions";
import { requireWorkspaceRole } from "../../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = {
  params: Promise<{ id: string; versionId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = updateVersionSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);

    const { id, versionId } = await context.params;
    const guard = await projectGuard(result.session, id, "edit");
    if (guard) return guard;
    const version = await updateVersion(
      id,
      versionId,
      validation.data,
      session.workspace.id,
    );
    return version ? NextResponse.json(version) : notFound("Version");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(
      error,
      "Version could not be updated",
      [InvalidDriverError],
      [DuplicateVersionNameError],
    );
  }
}

/** `?moveTo=<versionId>` moves the version's issues; otherwise the fix version is removed. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id, versionId } = await context.params;
    const guard = await projectGuard(result.session, id, "edit");
    if (guard) return guard;
    const moveTo = request.nextUrl.searchParams.get("moveTo") || null;
    const deleted = await deleteVersion(
      id,
      versionId,
      moveTo,
      session.workspace.id,
    );
    return deleted ? NextResponse.json({ ok: true }) : notFound("Version");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Version could not be deleted", [
      InvalidTargetVersionError,
    ]);
  }
}
