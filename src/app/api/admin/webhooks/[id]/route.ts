import { NextRequest, NextResponse } from "next/server";
import {
  deleteWebhook,
  updateWebhook,
  updateWebhookSchema,
  WebhookTargetError,
} from "../../../../../server/webhooks";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../server/session";
import { webhookOwnersOnly as ownersOnly } from "../../_lib/responses";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"], ownersOnly);
  if ("response" in result) return result.response;
  const { id } = await context.params;

  try {
    const validation = updateWebhookSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: validation.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const webhook = await updateWebhook(id, validation.data, actorFromSession(result.session));
    if (!webhook) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    return NextResponse.json(webhook);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (error instanceof WebhookTargetError) {
      return NextResponse.json(
        { error: error.message, fields: { url: [error.message] } },
        { status: 400 },
      );
    }
    console.error("Failed to update webhook", error);
    return NextResponse.json({ error: "The webhook could not be updated" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"], ownersOnly);
  if ("response" in result) return result.response;
  const { id } = await context.params;

  try {
    const deleted = await deleteWebhook(id, actorFromSession(result.session));
    if (!deleted) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete webhook", error);
    return NextResponse.json({ error: "The webhook could not be deleted" }, { status: 500 });
  }
}
