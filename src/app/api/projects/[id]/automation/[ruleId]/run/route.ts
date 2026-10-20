import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../../../server/projectAccess";
import { z } from "zod";
import {
  AutomationRunError,
  runRuleNow,
} from "../../../../../../../server/automation";
import { recordAudit } from "../../../../../../../server/audit";
import { requireWorkspaceRole } from "../../../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../../http";

type RouteContext = {
  params: Promise<{ id: string; ruleId: string }>;
};

const runSchema = z
  .object({ issueId: z.string().trim().min(1).max(120).optional() })
  .strict();

/**
 * Runs a scheduled rule now, or a manual rule on one issue
 * (the issue view's "Run automation" menu). Body: { issueId? }.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const text = await request.text();
    const validation = runSchema.safeParse(text ? JSON.parse(text) : {});
    if (!validation.success) return validationFailed(validation.error);

    const { id, ruleId } = await context.params;
    const guard = await projectGuard(result.session, id, "admin");
    if (guard) return guard;
    const runs = await runRuleNow(
      id,
      ruleId,
      {
        id: session.user.id,
        name: session.user.name,
        organizationId: session.workspace.id,
      },
      validation.data.issueId,
    );
    if (!runs) return notFound("Automation rule");
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "automation.run",
      targetType: "automationRule",
      targetId: ruleId,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof AutomationRunError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return errorResponse(error, "Automation rule could not be run");
  }
}
