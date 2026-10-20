import { NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import { listLabels } from "../../../server/issues";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    return NextResponse.json(await listLabels(session.workspace.id));
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load labels", error);
    return NextResponse.json(
      { error: "Labels could not be loaded" },
      { status: 500 },
    );
  }
}
