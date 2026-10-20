import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import {
  createCustomField,
  CustomFieldInputError,
  DuplicateCustomFieldError,
  listAllCustomFields,
  listCustomFieldsForScope,
} from "../../../server/customFields";
import { createCustomFieldSchema } from "../../../server/customFieldSchemas";
import {
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../server/session";
import { errorResponse, validationFailed } from "../projects/http";
import { ownerOnlyResponse } from "./ownerOnly";

export const dynamic = "force-dynamic";

/**
 * GET: every custom field in the workspace (global and per project), used by
 * issue screens, JQL and columns. `?scope=global` lists only global fields
 * with usage counts for the admin page.
 */
export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const scope = request.nextUrl.searchParams.get("scope");
    const fields =
      scope === "global"
        ? await listCustomFieldsForScope(session.workspace.id, "global")
        : await listAllCustomFields(session.workspace.id);
    return NextResponse.json(fields, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Custom fields could not be loaded");
  }
}

/** POST: create a global field (workspace owners). */
export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner"], ownerOnlyResponse);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createCustomFieldSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const field = await createCustomField(session.workspace.id, null, validation.data, {
      id: session.user.id,
      name: session.user.name,
    });
    return NextResponse.json(field, { status: 201 });
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
