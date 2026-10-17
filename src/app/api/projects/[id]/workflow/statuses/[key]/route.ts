import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../../../../server/audit";
import { requireWorkspaceRole } from "../../../../../../../server/session";
import {
  deleteStatus,
  deleteStatusSchema,
  updateStatus,
  updateStatusSchema,
  workflowConflictErrors,
  workflowDomainErrors,
} from "../../../../../../../server/workflows";
import { errorResponse, notFound, validationFailed } from "../../../../http";

type RouteContext = { params: Promise<{ id: string; key: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = updateStatusSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id, key } = await context.params;
    const workflow = await updateStatus(
      id,
      decodeURIComponent(key),
      validation.data,
      result.session.workspace.id,
    );
    await recordAudit({
      organizationId: result.session.workspace.id,
      actor: { id: result.session.user.id, name: result.session.user.name },
      action: "workflow.status_updated",
      targetType: "project",
      targetId: id,
    });
    return workflow ? NextResponse.json(workflow) : notFound("Status");
  } catch (error) {
    return errorResponse(
      error,
      "Status could not be updated",
      workflowDomainErrors,
      workflowConflictErrors,
    );
  }
}

/** Deletes a status; `?replacement=<key>` (or JSON body) moves existing work. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const text = await request.text();
    const validation = deleteStatusSchema.safeParse(
      text
        ? JSON.parse(text)
        : {
            replacementKey:
              request.nextUrl.searchParams.get("replacement") ?? undefined,
          },
    );
    if (!validation.success) return validationFailed(validation.error);
    const { id, key } = await context.params;
    const workflow = await deleteStatus(
      id,
      decodeURIComponent(key),
      validation.data.replacementKey,
      result.session.workspace.id,
    );
    await recordAudit({
      organizationId: result.session.workspace.id,
      actor: { id: result.session.user.id, name: result.session.user.name },
      action: "workflow.status_deleted",
      targetType: "project",
      targetId: id,
    });
    return workflow ? NextResponse.json(workflow) : notFound("Status");
  } catch (error) {
    return errorResponse(
      error,
      "Status could not be deleted",
      workflowDomainErrors,
      workflowConflictErrors,
    );
  }
}
