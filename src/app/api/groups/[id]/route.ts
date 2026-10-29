import { NextResponse } from "next/server";
import {
  deleteGroup,
  GroupNameTakenError,
  UnknownGroupMemberError,
  updateGroup,
  updateGroupSchema,
} from "../../../../server/groups";
import { requireWorkspaceRole } from "../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../projects/http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"]);
  if ("response" in result) return result.response;
  try {
    const validation = updateGroupSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const group = await updateGroup(id, result.session.workspace.id, validation.data);
    return group ? NextResponse.json(group) : notFound("Group");
  } catch (error) {
    return errorResponse(
      error,
      "Group could not be updated",
      [UnknownGroupMemberError],
      [GroupNameTakenError],
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner"]);
  if ("response" in result) return result.response;
  try {
    const { id } = await context.params;
    return (await deleteGroup(id, result.session.workspace.id))
      ? NextResponse.json({ ok: true })
      : notFound("Group");
  } catch (error) {
    return errorResponse(error, "Group could not be deleted");
  }
}
