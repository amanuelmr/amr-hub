import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, projectGuard } from "../../../../../server/projectAccess";
import { createForm, FormInputError, listForms } from "../../../../../server/forms";
import { createFormSchema } from "../../../../../server/formSchemas";
import { requireWorkspaceRole, requireWorkspaceSession } from "../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "view");
    if (guard) return guard;
    const forms = await listForms(id, result.session.workspace.id);
    return forms ? NextResponse.json(forms) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Forms could not be loaded");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = createFormSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const guard = await projectGuard(result.session, id, "admin");
    if (guard) return guard;
    const form = await createForm(id, validation.data, result.session.workspace.id);
    return form ? NextResponse.json(form, { status: 201 }) : notFound("Project");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Form could not be created", [FormInputError]);
  }
}
