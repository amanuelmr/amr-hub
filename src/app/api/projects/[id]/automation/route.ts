import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../../server/audit";
import {
  createAutomationRule,
  listAutomationRules,
} from "../../../../../server/automation";
import { automationRuleInputSchema } from "../../../../../server/automationRules";
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
    const trigger = request.nextUrl.searchParams.get("trigger") ?? undefined;
    const rules = await listAutomationRules(id, session.workspace.id, {
      trigger,
    });
    return rules ? NextResponse.json(rules) : notFound("Project");
  } catch (error) {
    return errorResponse(error, "Automation rules could not be loaded");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = automationRuleInputSchema.safeParse(
      await request.json(),
    );
    if (!validation.success) return validationFailed(validation.error);

    const { id } = await context.params;
    const rule = await createAutomationRule(
      id,
      validation.data,
      session.workspace.id,
    );
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "automation.created",
      targetType: "project",
      targetId: id,
    });
    return rule
      ? NextResponse.json(rule, { status: 201 })
      : notFound("Project");
  } catch (error) {
    return errorResponse(error, "Automation rule could not be created");
  }
}
