import { NextRequest, NextResponse } from "next/server";
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
      }),
    );
  } catch (error) {
    console.error("Failed to load notifications", error);
    return NextResponse.json(
      { error: "Notifications could not be loaded" },
      { status: 500 },
    );
  }
}
