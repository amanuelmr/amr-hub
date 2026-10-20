import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../server/projectAccess";
import {
  CustomFieldInputError,
  deleteCustomField,
  DuplicateCustomFieldError,
  updateCustomField,
} from "../../../../server/customFields";
import { updateCustomFieldSchema } from "../../../../server/customFieldSchemas";
import { requireWorkspaceRole } from "../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../projects/http";
import { ownerOnlyResponse } from "../ownerOnly";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"], ownerOnlyResponse);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = updateCustomFieldSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const field = await updateCustomField(
      session.workspace.id,
      id,
      validation.data,
      { id: session.user.id, name: session.user.name },
      null,
    );
    return field ? NextResponse.json(field) : notFound("Custom field");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(
      error,
      "Custom field could not be updated",
      [CustomFieldInputError],
      [DuplicateCustomFieldError],
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"], ownerOnlyResponse);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const deleted = await deleteCustomField(
      session.workspace.id,
      id,
      { id: session.user.id, name: session.user.name },
      null,
    );
    return deleted ? NextResponse.json(deleted) : notFound("Custom field");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Custom field could not be deleted");
  }
}
