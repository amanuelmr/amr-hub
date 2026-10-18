import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../../server/projectAccess";
import {
  CustomFieldInputError,
  deleteCustomField,
  DuplicateCustomFieldError,
  updateCustomField,
} from "../../../../../../server/customFields";
import { updateCustomFieldSchema } from "../../../../../../server/customFieldSchemas";
import { requireWorkspaceRole } from "../../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = { params: Promise<{ id: string; fieldId: string }> };

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = updateCustomFieldSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id, fieldId } = await context.params;
    const guard = await projectGuard(result.session, id, "admin");
    if (guard) return guard;
    const field = await updateCustomField(
      session.workspace.id,
      fieldId,
      validation.data,
      { id: session.user.id, name: session.user.name },
      id,
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
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id, fieldId } = await context.params;
    const guard = await projectGuard(result.session, id, "admin");
    if (guard) return guard;
    const deleted = await deleteCustomField(
      session.workspace.id,
      fieldId,
      { id: session.user.id, name: session.user.name },
      id,
    );
    return deleted ? NextResponse.json(deleted) : notFound("Custom field");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Custom field could not be deleted");
  }
}
