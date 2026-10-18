import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import type { ZodError } from "zod";
import { createSavedViewSchema } from "../../../server/savedViewSchemas";
import {
  createSavedView,
  DuplicateSavedViewError,
  listSavedViews,
} from "../../../server/savedViews";
import { UnknownLabelError } from "../../../server/issues";
import {
  actorFromSession,
  requireWorkspaceSession,
} from "../../../server/session";

export const dynamic = "force-dynamic";

function jqlErrorMessage(error: ZodError): string | null {
  const issues = error.issues.flatMap((issue) =>
    issue.code === "invalid_union"
      ? issue.unionErrors.flatMap((unionError) => unionError.issues)
      : [issue],
  );
  return (
    issues.find((issue) => issue.code === "custom" && issue.path[0] === "jql")
      ?.message ?? null
  );
}

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const all = request.nextUrl.searchParams.get("scope") === "all";
    return NextResponse.json(
      await listSavedViews(session.user.id, session.workspace.id, { all }),
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load saved views", error);
    return NextResponse.json(
      { error: "Saved views could not be loaded" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createSavedViewSchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        {
          error: jqlErrorMessage(validation.error) ?? "Validation failed",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await createSavedView(validation.data, actorFromSession(session)),
      { status: 201 },
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    if (
      error instanceof DuplicateSavedViewError ||
      error instanceof UnknownLabelError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to create saved view", error);
    return NextResponse.json(
      { error: "Saved view could not be created" },
      { status: 500 },
    );
  }
}
