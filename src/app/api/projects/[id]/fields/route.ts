import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../server/projectAccess";
import {
  createCustomField,
  CustomFieldInputError,
  DuplicateCustomFieldError,
  listCustomFieldsForScope,
} from "../../../../../server/customFields";
import { createCustomFieldSchema } from "../../../../../server/customFieldSchemas";
import {
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** GET: the project's own custom fields (with usage counts). */
export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "view");
    if (guard) return guard;
    const fields = await listCustomFieldsForScope(session.workspace.id, { projectId: id });
    return fields ? NextResponse.json(fields) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Custom fields could not be loaded");
  }
}

/** POST: create a field that only this project uses. */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createCustomFieldSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "admin");
    if (guard) return guard;
    const field = await createCustomField(session.workspace.id, id, validation.data, {
      id: session.user.id,
      name: session.user.name,
    });
    return field ? NextResponse.json(field, { status: 201 }) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(
      error,
      "Custom field could not be created",
      [CustomFieldInputError],
      [DuplicateCustomFieldError],
    );
  }
}
