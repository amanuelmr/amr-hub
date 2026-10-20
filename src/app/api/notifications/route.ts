import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import { listNotifications } from "../../../server/notifications";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    return NextResponse.json(
      await listNotifications(session.user.id, session.workspace.id, {
        cursor,
        limit,
        role: session.workspace.role,
      }),
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load notifications", error);
    return NextResponse.json(
      { error: "Notifications could not be loaded" },
      { status: 500 },
    );
  }
}
