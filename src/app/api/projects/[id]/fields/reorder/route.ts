import { NextRequest, NextResponse } from "next/server";
import {
  CustomFieldInputError,
  reorderCustomFields,
} from "../../../../../../server/customFields";
import { reorderCustomFieldsSchema } from "../../../../../../server/customFieldSchemas";
import { requireWorkspaceRole } from "../../../../../../server/session";
import prisma from "../../../../../../../prisma/client";
import { errorResponse, notFound, validationFailed } from "../../../http";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** POST { ids }: sets the order of this project's fields. */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = reorderCustomFieldsSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const project = await prisma.project.findFirst({
      where: { id, organizationId: session.workspace.id },
      select: { id: true },
    });
    if (!project) return notFound("Project");
    const fields = await reorderCustomFields(session.workspace.id, id, validation.data.ids);
    return NextResponse.json(fields);
  } catch (error) {
    return errorResponse(error, "Custom fields could not be reordered", [CustomFieldInputError]);
  }
}
