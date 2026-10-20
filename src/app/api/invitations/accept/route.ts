import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../server/projectAccess";
import {
  acceptInvitationSchema,
  invitationTokenSchema,
} from "../../../../server/invitationSchemas";
import {
  acceptMemberInvitation,
  getInvitation,
  InvitationError,
} from "../../../../server/invitations";

export const dynamic = "force-dynamic";

function unavailableResponse() {
  return NextResponse.json(
    { error: "This invitation is invalid, expired, or already used" },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: NextRequest) {
  const validation = invitationTokenSchema.safeParse(
    request.nextUrl.searchParams.get("token"),
  );
  if (!validation.success) return unavailableResponse();

  try {
    return NextResponse.json(await getInvitation(validation.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof InvitationError) return unavailableResponse();
    console.error("Failed to verify invitation", error);
    return NextResponse.json(
      { error: "Invitation could not be verified" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = acceptInvitationSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Check your name and use a password of 12 to 128 characters",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const user = await acceptMemberInvitation(validation.data);
    return NextResponse.json(
      { email: user.email },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof InvitationError) {
      return error.code === "EMAIL_IN_USE"
        ? NextResponse.json(
            { error: "An account already exists for this email" },
            { status: 409 },
          )
        : unavailableResponse();
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    console.error("Failed to accept invitation", error);
    return NextResponse.json(
      { error: "Account could not be created" },
      { status: 500 },
    );
  }
}
