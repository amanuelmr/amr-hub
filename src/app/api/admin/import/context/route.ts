import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../../server/projectAccess";
import {
  loadImportProjects,
  loadProjectImportContext,
} from "../../../../../server/csvImport";
import { listOrganizationMembers } from "../../../../../server/members";
import { requireWorkspaceRole } from "../../../../../server/session";

export const dynamic = "force-dynamic";

/** Projects + members, and the selected project's statuses/types/sprints for the import wizard. */
export async function GET(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const organizationId = result.session.workspace.id;
  const projectId = request.nextUrl.searchParams.get("projectId");

  try {
    const [projects, members, project] = await Promise.all([
      loadImportProjects(organizationId),
      listOrganizationMembers(organizationId),
      projectId ? loadProjectImportContext(organizationId, projectId) : null,
    ]);
    if (projectId && !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({
      projects,
      members: members.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email ?? "",
      })),
      project,
    });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load import context", error);
    return NextResponse.json(
      { error: "Import settings could not be loaded" },
      { status: 500 },
    );
  }
}
