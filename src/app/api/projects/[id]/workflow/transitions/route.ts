import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../../../server/audit";
import { requireWorkspaceRole } from "../../../../../../server/session";
import {
  createTransition,
  createTransitionSchema,
  workflowConflictErrors,
  workflowDomainErrors,
} from "../../../../../../server/workflows";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = { params: Promise<{ id: string }> };

/** Adds a transition: { name, fromKey (null = from any status), toKey }. */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = createTransitionSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const workflow = await createTransition(
      id,
      validation.data,
      result.session.workspace.id,
    );
    await recordAudit({
      organizationId: result.session.workspace.id,
      actor: { id: result.session.user.id, name: result.session.user.name },
      action: "workflow.transition_created",
      targetType: "project",
      targetId: id,
    });
    return workflow
      ? NextResponse.json(workflow, { status: 201 })
      : notFound("Project");
  } catch (error) {
    return errorResponse(
      error,
      "Transition could not be created",
      workflowDomainErrors,
      workflowConflictErrors,
    );
  }
}
