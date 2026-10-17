import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceSession } from "../../../server/session";
import { listOrganizationWorkflows } from "../../../server/workflows";
import { errorResponse } from "../projects/http";

/** Every project's workflow (statuses, transitions, work types) keyed by project id. */
export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    return NextResponse.json(
      await listOrganizationWorkflows(result.session.workspace.id),
    );
  } catch (error) {
    return errorResponse(error, "Workflows could not be loaded");
  }
}
