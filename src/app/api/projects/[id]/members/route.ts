import { NextRequest, NextResponse } from "next/server";
import { listProjectPeople } from "../../../../../server/projects";
import { requireWorkspaceSession } from "../../../../../server/session";
import { errorResponse } from "../../http";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    return NextResponse.json(await listProjectPeople(session.workspace.id));
  } catch (error) {
    return errorResponse(error, "Members could not be loaded");
  }
}
