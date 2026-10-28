import { NextResponse } from "next/server";
import {
  createGroup,
  createGroupSchema,
  GroupNameTakenError,
  listGroups,
  UnknownGroupMemberError,
} from "../../../server/groups";
import { requireWorkspaceRole, requireWorkspaceSession } from "../../../server/session";
import { errorResponse, validationFailed } from "../projects/http";

export const dynamic = "force-dynamic";

/** Everyone in the workspace can list groups, so they can share with them. */
export async function GET(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  try {
    return NextResponse.json(await listGroups(result.session.workspace.id));
  } catch (error) {
    return errorResponse(error, "Groups could not be loaded");
  }
}

/** Only workspace owners manage groups. */
export async function POST(request: Request) {
  const result = await requireWorkspaceRole(request, ["owner"]);
  if ("response" in result) return result.response;
  try {
    const validation = createGroupSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const group = await createGroup(result.session.workspace.id, validation.data);
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    return errorResponse(
      error,
      "Group could not be created",
      [UnknownGroupMemberError],
      [GroupNameTakenError],
    );
  }
}
