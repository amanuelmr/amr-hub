import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../server/projectAccess";
import { createInvitationSchema } from "../../../server/invitationSchemas";
import {
  createMemberInvitation,
  InvitationError,
  listWorkspaceAccess,
} from "../../../server/invitations";
import { requireWorkspaceRole } from "../../../server/session";
import { recordAudit } from "../../../server/audit";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json(
    { error: "Owner access required" },
    { status: 403 },
  );
}

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceRole(
    request,
    ["owner"],
    forbiddenResponse,
  );
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    return NextResponse.json(await listWorkspaceAccess(session.workspace.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load workspace access", error);
    return NextResponse.json(
      { error: "Workspace access could not be loaded" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(
    request,
    ["owner"],
    forbiddenResponse,
  );
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = createInvitationSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Enter a valid email address",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const result = await createMemberInvitation(
      validation.data.email,
      session.user.id,
      request.nextUrl.origin,
      session.workspace.id,
      validation.data.role,
      {
        inviterName: session.user.name,
        organizationName: session.workspace.name,
      },
    );
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "invitation.created",
      targetType: "invitation",
      targetId: null,
      details: { email: validation.data.email, role: validation.data.role },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof InvitationError) {
      const messages = {
        ALREADY_INVITED: "A pending invitation already exists for this email",
        EMAIL_IN_USE: "This email already belongs to a workspace member",
        INVITATION_INVALID: "This invitation is no longer available",
      };
      return NextResponse.json(
        { error: messages[error.code] },
        { status: 409 },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    console.error("Failed to create invitation", error);
    return NextResponse.json(
      { error: "Invitation could not be created" },
      { status: 500 },
    );
  }
}
