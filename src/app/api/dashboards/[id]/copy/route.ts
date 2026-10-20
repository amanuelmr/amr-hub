import { NextRequest, NextResponse } from "next/server";
import { copyDashboard } from "../../../../../server/dashboards";
import {
  dashboardError,
  dashboardNotFound,
  dashboardSession,
  type DashboardRouteContext,
} from "../../http";

/** Jira "Copy dashboard": a private copy owned by you. */
export async function POST(request: NextRequest, context: DashboardRouteContext) {
  const auth = await dashboardSession(request);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await context.params;
    const dashboard = await copyDashboard(id, auth.user, auth.organizationId);
    return dashboard ? NextResponse.json(dashboard, { status: 201 }) : dashboardNotFound();
  } catch (error) {
    return dashboardError(error, "Dashboard could not be copied");
  }
}
