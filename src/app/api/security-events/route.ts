import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import { listSecurityEvents } from "../../../server/securityEvents";
import { getRequestSession, unauthorizedResponse } from "../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) return unauthorizedResponse();

  try {
    return NextResponse.json(
      { events: await listSecurityEvents(session.user.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load security activity", error);
    return NextResponse.json(
      { error: "Security activity could not be loaded" },
      { status: 500 },
    );
  }
}
