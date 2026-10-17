import { NextRequest, NextResponse } from "next/server";
import { sendTestWebhook } from "../../../../../../server/webhooks";
import { requireWorkspaceRole } from "../../../../../../server/session";
import { webhookOwnersOnly as ownersOnly } from "../../../_lib/responses";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"], ownersOnly);
  if ("response" in result) return result.response;
  const { id } = await context.params;

  try {
    const delivery = await sendTestWebhook(
      id,
      result.session.workspace.id,
      result.session.user.name,
    );
    if (!delivery) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    return NextResponse.json(delivery);
  } catch (error) {
    console.error("Failed to send test webhook", error);
    return NextResponse.json({ error: "The test delivery failed" }, { status: 500 });
  }
}
