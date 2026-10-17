import { NextResponse } from "next/server";
import { getRecentlyViewed, getYourWork } from "../../../server/yourWork";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const url = new URL(request.url);
    if (url.searchParams.get("only") === "recent") {
      const limit = Math.min(
        Math.max(Number.parseInt(url.searchParams.get("limit") ?? "5", 10) || 5, 1),
        20,
      );
      return NextResponse.json({
        recent: await getRecentlyViewed(session.user.id, session.workspace.id, limit),
      });
    }

    return NextResponse.json(
      await getYourWork(session.user.id, session.workspace.id),
    );
  } catch (error) {
    console.error("Failed to load your work", error);
    return NextResponse.json(
      { error: "Your work could not be loaded" },
      { status: 500 },
    );
  }
}
