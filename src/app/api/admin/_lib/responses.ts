import { NextResponse } from "next/server";

export function ownersOnlyResponse(what: string) {
  return () =>
    NextResponse.json({ error: `Only workspace owners can ${what}` }, { status: 403 });
}

export const webhookOwnersOnly = ownersOnlyResponse("manage webhooks");
