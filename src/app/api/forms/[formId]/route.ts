import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, accessUserFromSession } from "../../../../server/projectAccess";
import { getFormForFill } from "../../../../server/forms";
import { requireWorkspaceSession } from "../../../../server/session";
import { errorResponse, notFound } from "../../projects/http";

type RouteContext = { params: Promise<{ formId: string }> };

export const dynamic = "force-dynamic";

/** Form schema for the fill page — any workspace member (viewers included). */
export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { formId } = await context.params;
    const payload = await getFormForFill(
      formId,
      result.session.workspace.id,
      accessUserFromSession(result.session),
    );
    return payload ? NextResponse.json(payload) : notFound("Form");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Form could not be loaded");
  }
}
