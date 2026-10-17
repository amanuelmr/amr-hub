import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../../../../server/audit";
import { requireWorkspaceRole } from "../../../../../../../server/session";
import {
  deleteTransition,
  updateTransition,
  updateTransitionSchema,
  workflowConflictErrors,
  workflowDomainErrors,
} from "../../../../../../../server/workflows";
import { errorResponse, notFound, validationFailed } from "../../../../http";

type RouteContext = {
  params: Promise<{ id: string; transitionId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = updateTransitionSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id, transitionId } = await context.params;
    const workflow = await updateTransition(
      id,
      transitionId,
      validation.data,
      result.session.workspace.id,
    );
    await recordAudit({
      organizationId: result.session.workspace.id,
      actor: { id: result.session.user.id, name: result.session.user.name },
      action: "workflow.transition_updated",
      targetType: "project",
      targetId: id,
    });
    return workflow ? NextResponse.json(workflow) : notFound("Transition");
  } catch (error) {
    return errorResponse(
      error,
      "Transition could not be updated",
      workflowDomainErrors,
      workflowConflictErrors,
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const { id, transitionId } = await context.params;
    const workflow = await deleteTransition(
      id,
      transitionId,
      result.session.workspace.id,
    );
    await recordAudit({
      organizationId: result.session.workspace.id,
      actor: { id: result.session.user.id, name: result.session.user.name },
      action: "workflow.transition_deleted",
      targetType: "project",
      targetId: id,
    });
    return workflow ? NextResponse.json(workflow) : notFound("Transition");
  } catch (error) {
    return errorResponse(error, "Transition could not be deleted");
  }
}
