import { NextRequest, NextResponse } from "next/server";
import { listLiveChanges } from "../../../server/live";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

const MAX_IDS = 500;

/**
 * GET /api/live?since=<iso>&ids=A-1,A-2
 * → { now, changes: [{ id, updatedAt, actorId, actorName }], deleted: [ids] }
 * Without `since` it only returns `now` (and `deleted`), to seed the poll.
 */
export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  const params = request.nextUrl.searchParams;
  const sinceParam = params.get("since");
  let since: Date | null = null;
  if (sinceParam) {
    since = new Date(sinceParam);
    if (Number.isNaN(since.getTime())) {
      return NextResponse.json(
        { error: "since must be an ISO date" },
        { status: 400 },
      );
    }
  }
  const ids = [
    ...new Set(
      (params.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id.length <= 120),
    ),
  ].slice(0, MAX_IDS);

  try {
    return NextResponse.json(
      await listLiveChanges(result.session.workspace.id, since, ids),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load live changes", error);
    return NextResponse.json(
      { error: "Live updates could not be loaded" },
      { status: 500 },
    );
  }
}
