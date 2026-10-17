import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { IssueActionError } from "../../../../../server/issueRelations";

export function validationFailed(error: ZodError) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.flatten().fieldErrors },
    { status: 400 },
  );
}

export function issueNotFound(message = "Issue not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function routeError(error: unknown, context: string, message: string) {
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  if (error instanceof IssueActionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(context, error);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Reads an optional JSON body; an empty body counts as {}. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text.trim() ? JSON.parse(text) : {};
}

export type IssueRouteContext = { params: Promise<{ id: string }> };
