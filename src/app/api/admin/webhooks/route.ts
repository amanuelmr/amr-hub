import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../server/projectAccess";
import {
  createWebhook,
  createWebhookSchema,
  listWebhooks,
  WebhookTargetError,
} from "../../../../server/webhooks";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../server/session";
import { webhookOwnersOnly } from "../_lib/responses";

export const dynamic = "force-dynamic";

const ownersOnly = webhookOwnersOnly;

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner"], ownersOnly);
  if ("response" in result) return result.response;

  try {
    return NextResponse.json({ webhooks: await listWebhooks(result.session.workspace.id) });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to list webhooks", error);
    return NextResponse.json({ error: "Webhooks could not be loaded" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner"], ownersOnly);
  if ("response" in result) return result.response;

  try {
    const validation = createWebhookSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: validation.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const created = await createWebhook(validation.data, actorFromSession(result.session));
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (error instanceof WebhookTargetError) {
      return NextResponse.json(
        { error: error.message, fields: { url: [error.message] } },
        { status: 400 },
      );
    }
    console.error("Failed to create webhook", error);
    return NextResponse.json({ error: "The webhook could not be created" }, { status: 500 });
  }
}
