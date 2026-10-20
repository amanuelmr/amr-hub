import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import { listFilterSubscriptions } from "../../../server/filterSubscriptions";
import {
  getNotificationSettings,
  notificationSettingsUpdateSchema,
  updateNotificationSettings,
} from "../../../server/notificationPreferences";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

/** The caller's notification settings plus their filter subscriptions. */
export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const [settings, subscriptions] = await Promise.all([
      getNotificationSettings(session.user.id),
      listFilterSubscriptions(session.user.id, session.workspace.id),
    ]);
    return NextResponse.json({ settings, subscriptions });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load notification preferences", error);
    return NextResponse.json(
      { error: "Notification settings could not be loaded" },
      { status: 500 },
    );
  }
}

/** Personal settings: every role (viewers included) can change their own. */
export async function PUT(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = notificationSettingsUpdateSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: "Invalid notification settings",
        details: validation.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const settings = await updateNotificationSettings(
      session.user.id,
      validation.data,
    );
    return NextResponse.json({ settings });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to save notification preferences", error);
    return NextResponse.json(
      { error: "Notification settings could not be saved" },
      { status: 500 },
    );
  }
}
