import { NextRequest, NextResponse } from "next/server";
import { createDashboardSchema } from "../../../server/dashboardSchemas";
import { createDashboard, listDashboards } from "../../../server/dashboards";
import { dashboardError, dashboardSession, readJson, validationFailed } from "./http";

export const dynamic = "force-dynamic";

/** Dashboards shared with the viewer: ?scope=all (default) | mine | starred. */
export async function GET(request: NextRequest) {
  const auth = await dashboardSession(request);
  if ("response" in auth) return auth.response;
  const raw = request.nextUrl.searchParams.get("scope");
  const scope = raw === "mine" || raw === "starred" ? raw : "all";
  try {
    return NextResponse.json(await listDashboards(auth.user, auth.organizationId, scope));
  } catch (error) {
    return dashboardError(error, "Dashboards could not be loaded");
  }
}

export async function POST(request: NextRequest) {
  const auth = await dashboardSession(request);
  if ("response" in auth) return auth.response;
  const validation = createDashboardSchema.safeParse(await readJson(request));
  if (!validation.success) return validationFailed(validation.error);
  try {
    return NextResponse.json(
      await createDashboard(validation.data, auth.user, auth.organizationId),
      { status: 201 },
    );
  } catch (error) {
    return dashboardError(error, "Dashboard could not be created");
  }
}
