import { NextRequest, NextResponse } from "next/server";
import { changeDashboardOwnerSchema } from "../../../../../server/dashboardSchemas";
import { changeDashboardOwner } from "../../../../../server/dashboards";
import {
  dashboardError,
  dashboardNotFound,
  dashboardSession,
  readJson,
  validationFailed,
  type DashboardRouteContext,
} from "../../http";

/**
 * Change the owner. Returns the dashboard, or 204 when the previous owner can
 * no longer see it (it was private).
 */
export async function PATCH(request: NextRequest, context: DashboardRouteContext) {
  const auth = await dashboardSession(request);
  if ("response" in auth) return auth.response;
  const validation = changeDashboardOwnerSchema.safeParse(await readJson(request));
  if (!validation.success) return validationFailed(validation.error);
  try {
    const { id } = await context.params;
    const result = await changeDashboardOwner(
      id,
      validation.data.userId,
      auth.user,
      auth.organizationId,
    );
    if (!result) return dashboardNotFound();
    return result.dashboard
      ? NextResponse.json(result.dashboard)
      : new NextResponse(null, { status: 204 });
  } catch (error) {
    return dashboardError(error, "Dashboard owner could not be changed");
  }
}
