import { NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../server/projectAccess";
import { updateSavedViewSchema } from "../../../../server/savedViewSchemas";
import {
  deleteSavedView,
  DuplicateSavedViewError,
  updateSavedView,
} from "../../../../server/savedViews";
import { requireWorkspaceSession } from "../../../../server/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = updateSavedViewSchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        {
          error:
            validation.error.issues[0]?.message ?? "Validation failed",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const view = await updateSavedView(
      id,
      validation.data,
      session.user.id,
      session.workspace.id,
    );

    if (!view) {
      return NextResponse.json(
        { error: "Saved view not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(view);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    if (error instanceof DuplicateSavedViewError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to update saved view", error);
    return NextResponse.json(
      { error: "Saved view could not be updated" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;

    if (
      !(await deleteSavedView(
        id,
        session.user.id,
        session.workspace.id,
      ))
    ) {
      return NextResponse.json(
        { error: "Saved view not found" },
        { status: 404 },
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to delete saved view", error);
    return NextResponse.json(
      { error: "Saved view could not be deleted" },
      { status: 500 },
    );
  }
}
