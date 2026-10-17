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
    const project = await getProject(id, session.workspace.id, session.user.id);
    return project ? NextResponse.json(project) : notFound("Project");
  } catch (error) {
    return errorResponse(error, "Project could not be loaded");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = updateProjectSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);

    const { id } = await context.params;
    const project = await updateProject(
      id,
      validation.data,
      session.workspace.id,
      session.user.id,
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
    return errorResponse(
      error,
      "Project could not be updated",
      [UnknownProjectLeadError],
      [DuplicateProjectKeyError, DuplicateProjectNameError],
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"], () =>
    NextResponse.json(
      { error: "Only workspace owners can delete projects" },
      { status: 403 },
    ),
  );
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const deleted = await deleteProject(id, session.workspace.id);
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "project.deleted",
      targetType: "project",
      targetId: id,
    });
    return deleted ? NextResponse.json({ ok: true }) : notFound("Project");
  } catch (error) {
    return errorResponse(error, "Project could not be deleted");
  }
}
