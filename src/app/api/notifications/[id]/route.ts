import { NextRequest, NextResponse } from "next/server";
import { setNotificationRead } from "../../../../server/notifications";
import { requireWorkspaceSession } from "../../../../server/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Marks a notification read, or unread with `{ "isRead": false }`. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  let isRead = true;
  const raw = await request.text();
  if (raw.trim()) {
    try {
      const body: unknown = JSON.parse(raw);
      if (
        typeof body === "object" &&
        body !== null &&
        "isRead" in body &&
        typeof body.isRead === "boolean"
      ) {
        isRead = body.isRead;
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const { id } = await context.params;
  const notification = await setNotificationRead(id, session.user.id, isRead);

  if (!notification) {
    return NextResponse.json(
      { error: "Notification not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(notification);
}
