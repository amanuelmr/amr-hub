import { NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import { TrashError } from "../../../server/trash";

export function trashErrorResponse(error: unknown, fallback: string) {
  const denied = accessErrorResponse(error);
  if (denied) return denied;
  if (error instanceof TrashError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
