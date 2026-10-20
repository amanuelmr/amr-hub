import { NextResponse } from "next/server";
import prisma from "../../prisma/client";
import { auth, type AuthSession } from "../lib/auth";

export async function getRequestSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}

export type WorkspaceContext = {
  id: string;
  name: string;
  key: string;
  slug: string;
  role: string;
};

export type WorkspaceSession = AuthSession & {
  workspace: WorkspaceContext | null;
};

export async function getWorkspaceSession(
  request: Request,
): Promise<WorkspaceSession | null> {
  const session = await getRequestSession(request);
  if (!session) return null;

  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) return { ...session, workspace: null };

  const membership = await prisma.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          key: true,
          slug: true,
        },
      },
    },
  });

  return {
    ...session,
    workspace: membership
      ? {
          ...membership.organization,
          role: membership.role,
        }
      : null,
  };
}

export function actorFromSession(session: WorkspaceSession) {
  if (!session.workspace) {
    throw new Error("Active organization required");
  }

  return {
    id: session.user.id,
    name: session.user.name,
    organizationId: session.workspace.id,
    organizationKey: session.workspace.key,
    role: session.workspace.role,
  };
}

export type ActiveWorkspaceSession = WorkspaceSession & {
  workspace: WorkspaceContext;
};

export async function requireWorkspaceSession(
  request: Request,
): Promise<{ response: NextResponse } | { session: ActiveWorkspaceSession }> {
  const session = await getWorkspaceSession(request);
  if (!session) return { response: unauthorizedResponse() };
  if (!session.workspace) return { response: organizationRequiredResponse() };
  return { session: session as ActiveWorkspaceSession };
}

export async function requireWorkspaceRole(
  request: Request,
  allowedRoles: string[],
  forbiddenResponse: () => NextResponse = viewerForbiddenResponse,
): Promise<{ response: NextResponse } | { session: ActiveWorkspaceSession }> {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result;
  if (!allowedRoles.includes(result.session.workspace.role)) {
    return { response: forbiddenResponse() };
  }
  return result;
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Authentication required" },
    { status: 401 },
  );
}

export function organizationRequiredResponse() {
  return NextResponse.json(
    {
      error: "Create or select an organization to continue",
      code: "ORGANIZATION_REQUIRED",
    },
    { status: 409 },
  );
}

export function viewerForbiddenResponse() {
  return NextResponse.json(
    { error: "Viewers have read-only access to this workspace" },
    { status: 403 },
  );
}
