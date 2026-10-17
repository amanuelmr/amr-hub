import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../../../server/audit";
import { requireWorkspaceRole } from "../../../../../../server/session";
import {
  createType,
  createTypeSchema,
  workflowConflictErrors,
  workflowDomainErrors,
} from "../../../../../../server/workflows";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = { params: Promise<{ id: string }> };

/** Adds a work type: { name, level: 1|0|-1, icon, color, description? }. */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = createTypeSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const workflow = await createType(
      id,
      validation.data,
      result.session.workspace.id,
    );
    await recordAudit({
      organizationId: result.session.workspace.id,
      actor: { id: result.session.user.id, name: result.session.user.name },
      action: "workflow.type_created",
      targetType: "project",
      targetId: id,
    });
    return workflow
      ? NextResponse.json(workflow, { status: 201 })
      : notFound("Project");
  } catch (error) {
    return errorResponse(
      error,
      "Work type could not be created",
      workflowDomainErrors,
      workflowConflictErrors,
    );
  }
}
