import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../../server/audit";
import { changeProjectKeySchema } from "../../../../../server/projectSchemas";
import { changeProjectKey, DuplicateProjectKeyError } from "../../../../../server/projects";
import {
  accessErrorResponse,
  accessUserFromSession,
  projectGuard,
} from "../../../../../server/projectAccess";
import { requireWorkspaceRole } from "../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Renames the project key; work items move to the new key with their numbers. */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;

    const validation = changeProjectKeySchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);

    const project = await changeProjectKey(
      id,
      validation.data.key,
      session.workspace.id,
      accessUserFromSession(session),
    );
    if (!project) return notFound("Project");
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "project.key_changed",
      targetType: "project",
      targetId: id,
      details: { key: validation.data.key },
    });
    return NextResponse.json(project);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Project key could not be changed", [], [DuplicateProjectKeyError]);
  }
}
