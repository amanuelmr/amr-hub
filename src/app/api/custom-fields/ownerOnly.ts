import { NextResponse } from "next/server";

export function ownerOnlyResponse() {
  return NextResponse.json(
    { error: "Only workspace owners can manage global custom fields" },
    { status: 403 },
  );
}
