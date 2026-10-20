import { NextRequest, NextResponse } from "next/server";
import { setDashboardStar } from "../../../../../server/dashboards";
import {
  dashboardError,
  dashboardNotFound,
  dashboardSession,
  type DashboardRouteContext,
} from "../../http";

async function star(request: NextRequest, context: DashboardRouteContext, starred: boolean) {
  const auth = await dashboardSession(request);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await context.params;
    const dashboard = await setDashboardStar(id, starred, auth.user, auth.organizationId);
    return dashboard ? NextResponse.json(dashboard) : dashboardNotFound();
  } catch (error) {
    return dashboardError(error, "Dashboard could not be starred");
  }
}

export function POST(request: NextRequest, context: DashboardRouteContext) {
  return star(request, context, true);
}

export function DELETE(request: NextRequest, context: DashboardRouteContext) {
  return star(request, context, false);
}
