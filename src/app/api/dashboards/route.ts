import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import { createDashboardSchema } from "../../../server/dashboardSchemas";
import { createDashboard, listDashboards } from "../../../server/dashboards";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    return NextResponse.json(
      await listDashboards(session.user.id, session.workspace.id),
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load dashboards", error);
    return NextResponse.json(
      { error: "Dashboards could not be loaded" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createDashboardSchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await createDashboard(
        validation.data,
        session.user.id,
        session.workspace.id,
      ),
      { status: 201 },
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    console.error("Failed to create dashboard", error);
    return NextResponse.json(
      { error: "Dashboard could not be created" },
      { status: 500 },
    );
  }
}
