import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../server/projectAccess";
import {
  CustomFieldInputError,
  reorderCustomFields,
} from "../../../../server/customFields";
import { reorderCustomFieldsSchema } from "../../../../server/customFieldSchemas";
import { requireWorkspaceRole } from "../../../../server/session";
import { errorResponse, validationFailed } from "../../projects/http";
import { ownerOnlyResponse } from "../ownerOnly";

export const dynamic = "force-dynamic";

/** POST { ids }: sets the order of the global fields. */
export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner"], ownerOnlyResponse);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = reorderCustomFieldsSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const fields = await reorderCustomFields(session.workspace.id, null, validation.data.ids);
    return NextResponse.json(fields);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Custom fields could not be reordered", [CustomFieldInputError]);
  }
}
