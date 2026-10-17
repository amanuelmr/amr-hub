import { NextRequest, NextResponse } from "next/server";
import { deleteForm, FormInputError, getProjectForm, updateForm } from "../../../../../../server/forms";
import { updateFormSchema } from "../../../../../../server/formSchemas";
import { requireWorkspaceRole, requireWorkspaceSession } from "../../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = { params: Promise<{ id: string; formId: string }> };

export const dynamic = "force-dynamic";

/** Builder payload: the form plus the project's work types. */
export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id, formId } = await context.params;
    const payload = await getProjectForm(id, formId, result.session.workspace.id);
    return payload ? NextResponse.json(payload) : notFound("Form");
  } catch (error) {
    return errorResponse(error, "Form could not be loaded");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = updateFormSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id, formId } = await context.params;
    const form = await updateForm(id, formId, validation.data, result.session.workspace.id);
    return form ? NextResponse.json(form) : notFound("Form");
  } catch (error) {
    return errorResponse(error, "Form could not be saved", [FormInputError]);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const { id, formId } = await context.params;
    const deleted = await deleteForm(id, formId, result.session.workspace.id);
    return deleted ? new NextResponse(null, { status: 204 }) : notFound("Form");
  } catch (error) {
    return errorResponse(error, "Form could not be deleted");
  }
}
