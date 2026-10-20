import { NextRequest, NextResponse } from "next/server";
import { updateDashboardSchema } from "../../../../server/dashboardSchemas";
import {
  deleteDashboard,
  getDashboard,
  updateDashboard,
} from "../../../../server/dashboards";
import {
  dashboardError,
  dashboardNotFound,
  dashboardSession,
  readJson,
  validationFailed,
  type DashboardRouteContext,
} from "../http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: DashboardRouteContext) {
  const auth = await dashboardSession(request);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await context.params;
    const dashboard = await getDashboard(id, auth.user, auth.organizationId);
    return dashboard ? NextResponse.json(dashboard) : dashboardNotFound();
  } catch (error) {
    return dashboardError(error, "Dashboard could not be loaded");
  }
}

export async function PATCH(request: NextRequest, context: DashboardRouteContext) {
  const auth = await dashboardSession(request);
  if ("response" in auth) return auth.response;
  const validation = updateDashboardSchema.safeParse(await readJson(request));
  if (!validation.success) return validationFailed(validation.error);
  try {
    const { id } = await context.params;
    const dashboard = await updateDashboard(id, validation.data, auth.user, auth.organizationId);
    return dashboard ? NextResponse.json(dashboard) : dashboardNotFound();
  } catch (error) {
    return dashboardError(error, "Dashboard could not be updated");
  }
}

export async function DELETE(request: NextRequest, context: DashboardRouteContext) {
  const auth = await dashboardSession(request);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await context.params;
    const deleted = await deleteDashboard(id, auth.user, auth.organizationId);
    return deleted ? new NextResponse(null, { status: 204 }) : dashboardNotFound();
  } catch (error) {
    return dashboardError(error, "Dashboard could not be deleted");
  }
}
