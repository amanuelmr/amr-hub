import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export function validationFailed(error: ZodError) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.flatten().fieldErrors },
    { status: 400 },
  );
}

export function notFound(what: string) {
  return NextResponse.json({ error: `${what} not found` }, { status: 404 });
}

/** Maps thrown errors to responses, matching the issues API conventions. */
export function errorResponse(
  error: unknown,
  fallback: string,
  domainErrors: { new (...args: never[]): Error }[] = [],
  conflictErrors: { new (...args: never[]): Error }[] = [],
) {
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  if (error instanceof RequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  if (conflictErrors.some((type) => error instanceof type)) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 409 },
    );
  }
  if (domainErrors.some((type) => error instanceof type)) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
