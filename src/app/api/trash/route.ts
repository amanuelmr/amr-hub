import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "../../../server/session";
import {
  listTrashedIssues,
  listTrashedProjects,
  TRASH_RETENTION_DAYS,
} from "../../../server/trash";

export const dynamic = "force-dynamic";

/** Workspace trash (owners): trashed projects and work items. */
export async function GET(request: Request) {
  const result = await requireWorkspaceRole(request, ["owner"], () =>
    NextResponse.json(
      { error: "Only workspace owners can view the trash" },
      { status: 403 },
    ),
  );
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const [projects, issues] = await Promise.all([
      listTrashedProjects(session.workspace.id),
      listTrashedIssues(session.workspace.id),
    ]);
    return NextResponse.json({
      retentionDays: TRASH_RETENTION_DAYS,
      projects,
      issues,
    });
  } catch (error) {
    console.error("Failed to load trash", error);
    return NextResponse.json({ error: "Trash could not be loaded" }, { status: 500 });
  }
}
