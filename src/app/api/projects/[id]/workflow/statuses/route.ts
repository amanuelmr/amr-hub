import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../../server/projectAccess";
import { recordAudit } from "../../../../../../server/audit";
import { requireWorkspaceRole } from "../../../../../../server/session";
import {
  createStatus,
  createStatusSchema,
  reorderSchema,
  reorderStatuses,
  workflowConflictErrors,
  workflowDomainErrors,
} from "../../../../../../server/workflows";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = { params: Promise<{ id: string }> };

/** Adds a status: { name, category: TODO|IN_PROGRESS|DONE, color? }. */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = createStatusSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "admin");
    if (guard) return guard;
    const workflow = await createStatus(
      id,
      validation.data,
      result.session.workspace.id,
    );
    await recordAudit({
      organizationId: result.session.workspace.id,
      actor: { id: result.session.user.id, name: result.session.user.name },
      action: "workflow.status_created",
      targetType: "project",
      targetId: id,
    });
    return workflow
      ? NextResponse.json(workflow, { status: 201 })
      : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(
      error,
      "Status could not be created",
      workflowDomainErrors,
      workflowConflictErrors,
    );
  }
}

/** Reorders statuses: { keys: string[] } (category order always wins). */
export async function PUT(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = reorderSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "admin");
    if (guard) return guard;
    const workflow = await reorderStatuses(
      id,
      validation.data.keys,
      result.session.workspace.id,
    );
    await recordAudit({
      organizationId: result.session.workspace.id,
      actor: { id: result.session.user.id, name: result.session.user.name },
      action: "workflow.statuses_reordered",
      targetType: "project",
      targetId: id,
    });
    return workflow ? NextResponse.json(workflow) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(
      error,
      "Statuses could not be reordered",
      workflowDomainErrors,
      workflowConflictErrors,
    );
  }
}
