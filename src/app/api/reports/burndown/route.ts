import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, accessUserFromSession } from "../../../../server/projectAccess";
import { getSprintReport } from "../../../../server/reports";
import { requireWorkspaceSession } from "../../../../server/session";

export const dynamic = "force-dynamic";

/** GET /api/reports/burndown?cycleId= — burndown, burnup and sprint report series. */
export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  const cycleId = request.nextUrl.searchParams.get("cycleId")?.trim();
  if (!cycleId || cycleId.length > 80) {
    return NextResponse.json(
      { error: "Validation failed", fields: { cycleId: ["Choose a sprint"] } },
      { status: 400 },
    );
  }

  try {
    const report = await getSprintReport(
      cycleId,
      result.session.workspace.id,
      accessUserFromSession(result.session),
    );
    if (!report) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to build sprint report", error);
    return NextResponse.json(
      { error: "Sprint report could not be built" },
      { status: 500 },
    );
  }
}
