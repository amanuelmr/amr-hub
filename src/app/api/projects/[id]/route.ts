import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../server/audit";
import { updateProjectSchema } from "../../../../server/projectSchemas";
import {
  deleteProject,
  DuplicateProjectKeyError,
  DuplicateProjectNameError,
  getProject,
  UnknownProjectLeadError,
  updateProject,
} from "../../../../server/projects";
import {
  accessUserFromSession,
  projectGuard, accessErrorResponse } from "../../../../server/projectAccess";
import {
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const project = await getProject(
      id,
      session.workspace.id,
      accessUserFromSession(session),
    );
    return project ? NextResponse.json(project) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Project could not be loaded");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;

    const validation = updateProjectSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);

    const project = await updateProject(
      id,
      validation.data,
      session.workspace.id,
      accessUserFromSession(session),
    );
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "project.updated",
      targetType: "project",
      targetId: id,
    });
    return project ? NextResponse.json(project) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(
      error,
      "Project could not be updated",
      [UnknownProjectLeadError],
      [DuplicateProjectKeyError, DuplicateProjectNameError],
    );
  }
}

/** Moves the project to the trash; owners can restore it for 60 days. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;

    const deleted = await deleteProject(id, session.workspace.id);
    if (!deleted) return notFound("Project");
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "project.trashed",
      targetType: "project",
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Project could not be deleted");
  }
}
