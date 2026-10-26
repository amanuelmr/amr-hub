import { NextRequest, NextResponse } from "next/server";
import { homepagePath } from "../data/notifications";
import { getNotificationSettings } from "../../server/notificationPreferences";
import { getWorkspaceSession } from "../../server/session";

export const dynamic = "force-dynamic";

/** Sends each person to the homepage they chose in their personal settings. */
export async function GET(request: NextRequest) {
  const session = await getWorkspaceSession(request);
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!session.workspace) return NextResponse.redirect(new URL("/onboarding", request.url));
  const { homepage } = await getNotificationSettings(session.user.id);
  return NextResponse.redirect(new URL(homepagePath(homepage), request.url));
}
