import { NextResponse } from "next/server";
import { markAllNotificationsRead } from "../../../../server/notifications";
import { requireWorkspaceSession } from "../../../../server/session";

export async function POST(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  await markAllNotificationsRead(session.user.id, session.workspace.id);

  return NextResponse.json({ ok: true });
}
