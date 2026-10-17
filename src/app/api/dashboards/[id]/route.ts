import { NextRequest, NextResponse } from "next/server";
import { updateDashboardSchema } from "../../../../server/dashboardSchemas";
import {
  deleteDashboard,
  getDashboard,
  updateDashboard,
} from "../../../../server/dashboards";
import { requireWorkspaceSession } from "../../../../server/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;

  try {
    const dashboard = await getDashboard(
      id,
      session.user.id,
      session.workspace.id,
    );
    return dashboard ? NextResponse.json(dashboard) : notFound();
  } catch (error) {
    console.error("Failed to load dashboard", error);
    return NextResponse.json(
      { error: "Dashboard could not be loaded" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = updateDashboardSchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const dashboard = await updateDashboard(
      id,
      validation.data,
      session.user.id,
      session.workspace.id,
    );
    return dashboard ? NextResponse.json(dashboard) : notFound();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    console.error("Failed to update dashboard", error);
    return NextResponse.json(
      { error: "Dashboard could not be updated" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;

  try {
    const deleted = await deleteDashboard(
      id,
      session.user.id,
      session.workspace.id,
    );
    return deleted ? NextResponse.json({ ok: true }) : notFound();
  } catch (error) {
    console.error("Failed to delete dashboard", error);
    return NextResponse.json(
      { error: "Dashboard could not be deleted" },
      { status: 500 },
    );
  }
}
