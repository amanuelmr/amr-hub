import { NextResponse } from "next/server";
import { accessErrorResponse, accessUserFromSession } from "../../../server/projectAccess";
import { listPeople } from "../../../server/people";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    return NextResponse.json(await listPeople(
        result.session.workspace.id,
        accessUserFromSession(result.session),
      ));
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load people", error);
    return NextResponse.json(
      { error: "People could not be loaded" },
      { status: 500 },
    );
  }
}
