import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../server/audit";
import { removeWorkspaceMember } from "../../../../server/members";
import { requireWorkspaceRole } from "../../../../server/session";

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Owner access required" },
    { status: 403 },
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const result = await requireWorkspaceRole(
    request,
    ["owner"],
    forbiddenResponse,
  );
  if ("response" in result) return result.response;
  const { session } = result;

  const { id } = await context.params;
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "The workspace owner cannot be removed" },
      { status: 400 },
    );
  }

  const removed = await removeWorkspaceMember(
    id,
    session.workspace.id,
    session.user.id,
  );
  await recordAudit({
    organizationId: session.workspace.id,
    actor: { id: session.user.id, name: session.user.name },
    action: "member.removed",
    targetType: "member",
    targetId: id,
  });
  if (!removed) {
    return NextResponse.json(
      { error: "Workspace member not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ removed: true });
}
