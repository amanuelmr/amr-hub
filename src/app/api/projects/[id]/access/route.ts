import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../../server/audit";
import {
  addProjectMembersSchema,
  projectAccessUpdateSchema,
  updateProjectMemberSchema,
} from "../../../../../server/projectSchemas";
import {
  addProjectMembers,
  getProjectAccess,
  ProjectPeopleError,
  removeProjectMember,
  setProjectAccessLevel,
  updateProjectMemberRole,
} from "../../../../../server/projects";
import { projectGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import {
  requireWorkspaceRole,
  requireWorkspaceSession,
  type ActiveWorkspaceSession,
} from "../../../../../server/session";
import { errorResponse, notFound, RequestError, validationFailed } from "../../http";

type RouteContext = { params: Promise<{ id: string }> };

function audit(
  session: ActiveWorkspaceSession,
  action: string,
  projectId: string,
  details: Record<string, unknown>,
) {
  return recordAudit({
    organizationId: session.workspace.id,
    actor: { id: session.user.id, name: session.user.name },
    action,
    targetType: "project",
    targetId: projectId,
    details,
  });
}

async function respondWithAccess(projectId: string, organizationId: string) {
  const access = await getProjectAccess(projectId, organizationId);
  return access ? NextResponse.json(access) : notFound("Project");
}

function peopleError(error: unknown, fallback: string) {
  if (error instanceof ProjectPeopleError) {
    return errorResponse(new RequestError(error.message, 400), fallback);
  }
  return errorResponse(error, fallback);
}

/** Access level + people with explicit project roles (project admins). */
export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;
    return respondWithAccess(id, session.workspace.id);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Project access could not be loaded");
  }
}

/** Changes the access level: { accessLevel: OPEN | LIMITED | PRIVATE }. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;
    const body = await request.json();

    // { userId, role } changes one person's role instead.
    if (body && typeof body === "object" && "userId" in body) {
      const validation = updateProjectMemberSchema.safeParse(body);
      if (!validation.success) return validationFailed(validation.error);
      const changed = await updateProjectMemberRole(
        id,
        validation.data.userId,
        validation.data.role,
      );
      if (!changed) return notFound("Project member");
      await audit(session, "project.member_role_changed", id, {
        userId: validation.data.userId,
        from: changed.previous,
        to: changed.role,
      });
      return respondWithAccess(id, session.workspace.id);
    }

    const validation = projectAccessUpdateSchema.safeParse(body);
    if (!validation.success) return validationFailed(validation.error);
    const changed = await setProjectAccessLevel(
      id,
      session.workspace.id,
      validation.data.accessLevel,
    );
    if (!changed) return notFound("Project");
    if (changed.previous !== changed.accessLevel) {
      await audit(session, "project.access_changed", id, {
        from: changed.previous,
        to: changed.accessLevel,
      });
    }
    return respondWithAccess(id, session.workspace.id);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return peopleError(error, "Project access could not be updated");
  }
}

/** Adds people: { userIds: string[], role }. */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;
    const validation = addProjectMembersSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const added = await addProjectMembers(
      id,
      session.workspace.id,
      validation.data.userIds,
      validation.data.role,
    );
    await audit(session, "project.members_added", id, {
      userIds: added,
      role: validation.data.role,
    });
    const response = await respondWithAccess(id, session.workspace.id);
    return new NextResponse(response.body, { status: 201, headers: response.headers });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return peopleError(error, "People could not be added");
  }
}

/** Removes a person: ?userId=. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;
  try {
    const { id } = await context.params;
    const denied = await projectGuard(session, id, "admin");
    if (denied) return denied;
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    const removed = await removeProjectMember(id, userId);
    if (!removed) return notFound("Project member");
    await audit(session, "project.member_removed", id, {
      userId,
      role: removed.role,
    });
    return respondWithAccess(id, session.workspace.id);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return peopleError(error, "Person could not be removed");
  }
}
