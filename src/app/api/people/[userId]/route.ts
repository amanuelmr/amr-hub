import { NextResponse } from "next/server";
import { getPersonProfile } from "../../../../server/people";
import { requireWorkspaceSession } from "../../../../server/session";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  const { userId } = await context.params;

  try {
    const profile = await getPersonProfile(userId, session.workspace.id, {
      userId: session.user.id,
      role: session.workspace.role,
    });
    if (!profile) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (error) {
    console.error("Failed to load profile", error);
    return NextResponse.json(
      { error: "Profile could not be loaded" },
      { status: 500 },
    );
  }
}
