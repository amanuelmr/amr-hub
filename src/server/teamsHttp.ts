import { NextResponse } from "next/server";
import type { z } from "zod";
import type { ActiveWorkspaceSession } from "./session";
import {
  TeamForbiddenError,
  TeamNameTakenError,
  UnknownTeamMemberError,
  type TeamViewer,
} from "./teams";

export function teamViewer(session: ActiveWorkspaceSession): TeamViewer {
  return { userId: session.user.id, role: session.workspace.role };
}

export function teamNotFound() {
  return NextResponse.json({ error: "Team not found" }, { status: 404 });
}

export function validationFailed(error: z.ZodError) {
  const flat = error.flatten();
  return NextResponse.json(
    {
      error: flat.formErrors[0] ?? "Validation failed",
      fields: flat.fieldErrors,
    },
    { status: 400 },
  );
}

/** Map known team errors to responses; anything else is a logged 500. */
export function teamErrorResponse(error: unknown, fallback: string) {
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  if (error instanceof TeamNameTakenError) {
    return NextResponse.json(
      { error: error.message, fields: { name: [error.message] } },
      { status: 409 },
    );
  }
  if (error instanceof UnknownTeamMemberError) {
    return NextResponse.json(
      { error: error.message, fields: { memberUserIds: [error.message] } },
      { status: 400 },
    );
  }
  if (error instanceof TeamForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
