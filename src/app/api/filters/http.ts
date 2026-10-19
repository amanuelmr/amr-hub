import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { FilterInputError, FilterPermissionError } from "../../../server/filters";
import { requireWorkspaceSession } from "../../../server/session";

export type FilterRouteContext = { params: Promise<{ id: string }> };

/** Session plus the actor shape the filters service expects. */
export async function filterSession(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result;
  const { session } = result;
  return {
    session,
    actor: {
      id: session.user.id,
      name: session.user.name,
      role: session.workspace.role,
      organizationId: session.workspace.id,
    },
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

export function filterNotFound() {
  return NextResponse.json({ error: "Filter not found" }, { status: 404 });
}

export function filterError(error: unknown, fallback: string) {
  if (error instanceof FilterInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof FilterPermissionError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
