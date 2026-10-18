import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, accessUserFromSession, projectGuard } from "../../../server/projectAccess";
import { createCycleSchema } from "../../../server/projectSchemas";
import {
  createCycle,
  DuplicateCycleNameError,
  listCycles,
  UnknownProjectError,
} from "../../../server/cycles";
import {
  actorFromSession,
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;

  try {
    if (projectId) {
      const denied = await projectGuard(session, projectId, "view");
      if (denied) return denied;
    }
    return NextResponse.json(
      await listCycles(session.workspace.id, projectId, accessUserFromSession(session)),
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load cycles", error);
    return NextResponse.json(
      { error: "Cycles could not be loaded" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createCycleSchema.safeParse(await request.json());

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
      await createCycle(validation.data, actorFromSession(session)),
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

    if (
      error instanceof UnknownProjectError ||
      error instanceof DuplicateCycleNameError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to create cycle", error);
    return NextResponse.json(
      { error: "Cycle could not be created" },
      { status: 500 },
    );
  }
}
