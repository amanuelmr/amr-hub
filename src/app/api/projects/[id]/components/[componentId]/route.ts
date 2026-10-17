import { NextRequest, NextResponse } from "next/server";
import {
  deleteComponent,
  DuplicateComponentNameError,
  InvalidComponentInputError,
  updateComponent,
  updateComponentSchema,
} from "../../../../../../server/components";
import { requireWorkspaceRole } from "../../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = {
  params: Promise<{ id: string; componentId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = updateComponentSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);

    const { id, componentId } = await context.params;
    const component = await updateComponent(
      id,
      componentId,
      validation.data,
      session.workspace.id,
    );
    return component ? NextResponse.json(component) : notFound("Component");
  } catch (error) {
    return errorResponse(
      error,
      "Component could not be updated",
      [InvalidComponentInputError],
      [DuplicateComponentNameError],
    );
  }
}

/** `?moveTo=<componentId>` re-tags the component's issues before deleting it. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id, componentId } = await context.params;
    const moveTo = request.nextUrl.searchParams.get("moveTo") || null;
    const deleted = await deleteComponent(
      id,
      componentId,
      moveTo,
      session.workspace.id,
    );
    return deleted ? NextResponse.json({ ok: true }) : notFound("Component");
  } catch (error) {
    return errorResponse(error, "Component could not be deleted", [
      InvalidComponentInputError,
    ]);
  }
}
