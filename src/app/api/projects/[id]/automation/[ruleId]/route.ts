import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../../../server/audit";
import {
  deleteAutomationRule,
  updateAutomationRule,
} from "../../../../../../server/automation";
import { automationRuleUpdateSchema } from "../../../../../../server/automationRules";
import { requireWorkspaceRole } from "../../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = {
  params: Promise<{ id: string; ruleId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = automationRuleUpdateSchema.safeParse(
      await request.json(),
    );
    if (!validation.success) return validationFailed(validation.error);

    const { id, ruleId } = await context.params;
    const rule = await updateAutomationRule(
      id,
      ruleId,
      validation.data,
      session.workspace.id,
    );
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "automation.updated",
      targetType: "automationRule",
      targetId: ruleId,
    });
    return rule ? NextResponse.json(rule) : notFound("Automation rule");
  } catch (error) {
    return errorResponse(error, "Automation rule could not be updated");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id, ruleId } = await context.params;
    const deleted = await deleteAutomationRule(
      id,
      ruleId,
      session.workspace.id,
    );
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "automation.deleted",
      targetType: "automationRule",
      targetId: ruleId,
    });
    return deleted
      ? NextResponse.json({ ok: true })
      : notFound("Automation rule");
  } catch (error) {
    return errorResponse(error, "Automation rule could not be deleted");
  }
}
