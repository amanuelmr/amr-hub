import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { DashboardInputError, DashboardPermissionError } from "../../../server/dashboards";
import { requireWorkspaceSession } from "../../../server/session";

export type DashboardRouteContext = { params: Promise<{ id: string }> };

export async function dashboardSession(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result;
  const { session } = result;
  return {
    user: { id: session.user.id, role: session.workspace.role },
    organizationId: session.workspace.id,
  };
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function validationFailed(error: ZodError) {
  return NextResponse.json(
    { error: error.issues[0]?.message ?? "Validation failed", fields: error.flatten().fieldErrors },
    { status: 400 },
  );
}

export function dashboardNotFound() {
  return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
}

export function dashboardError(error: unknown, fallback: string) {
  if (error instanceof DashboardInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DashboardPermissionError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
