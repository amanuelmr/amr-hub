import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import { listOrganizationMembers } from "../../../server/members";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    return NextResponse.json(
      await listOrganizationMembers(session.workspace.id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load workspace members", error);
    return NextResponse.json(
      { error: "Workspace members could not be loaded" },
      { status: 500 },
    );
  }
}
