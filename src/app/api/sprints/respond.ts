import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { DuplicateCycleNameError, UnknownProjectError } from "../../../server/cycles";
import { SprintNotFoundError, SprintStateError } from "../../../server/sprints";

export function validationError(error: ZodError) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.flatten().fieldErrors },
    { status: 400 },
  );
}

export function sprintErrorResponse(error: unknown, action: string) {
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  if (error instanceof SprintNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof SprintStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (
    error instanceof UnknownProjectError ||
    error instanceof DuplicateCycleNameError
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(`Failed to ${action} sprint`, error);
  return NextResponse.json(
    { error: `Sprint could not be ${action === "start" ? "started" : `${action}d`}` },
    { status: 500 },
  );
}
