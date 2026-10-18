import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "../../../../../server/audit";
import {
  accessUserFromSession,
  projectGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import { getProject, setProjectArchived } from "../../../../../server/projects";
import { requireWorkspaceRole } from "../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

const archiveSchema = z.object({ archived: z.boolean() }).strict();

/** Archives (read-only, hidden from lists) or restores a project. Admins only. */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;

    const validation = archiveSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);

    const changed = await setProjectArchived(
      id,
      session.workspace.id,
      validation.data.archived,
    );
    if (!changed) return notFound("Project");
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: validation.data.archived ? "project.archived" : "project.unarchived",
      targetType: "project",
      targetId: id,
    });
    return NextResponse.json(
      await getProject(id, session.workspace.id, accessUserFromSession(session)),
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Project could not be archived");
  }
}
