import { NextRequest, NextResponse } from "next/server";
import { listDependencies } from "../../../server/dependencies";
import { accessUserFromSession } from "../../../server/projectAccess";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

const MAX_PROJECTS = 50;

/** Blocking dependencies across projects (?projectIds=a,b) for the roadmap. */
export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  const projectIds = (request.nextUrl.searchParams.get("projectIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (projectIds.length > MAX_PROJECTS) {
    return NextResponse.json(
      { error: `Ask for at most ${MAX_PROJECTS} projects at a time` },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await listDependencies(
        [...new Set(projectIds)],
        accessUserFromSession(session),
        session.workspace.id,
      ),
    );
  } catch (error) {
    console.error("Failed to load dependencies", error);
    return NextResponse.json(
      { error: "Dependencies could not be loaded" },
      { status: 500 },
    );
  }
}
