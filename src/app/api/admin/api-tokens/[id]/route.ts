import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../../server/projectAccess";
import { revokeApiToken } from "../../../../../server/apiTokens";
import {
  actorFromSession,
  requireWorkspaceSession,
} from "../../../../../server/session";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;

  try {
    const revoked = await revokeApiToken(
      id,
      actorFromSession(session),
      session.workspace.role === "owner",
    );
    if (!revoked) {
      return NextResponse.json({ error: "API token not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to revoke API token", error);
    return NextResponse.json(
      { error: "The API token could not be revoked" },
      { status: 500 },
    );
  }
}
