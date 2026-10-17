import { NextRequest, NextResponse } from "next/server";
import {
  createApiToken,
  createApiTokenSchema,
  listApiTokens,
} from "../../../../server/apiTokens";
import {
  actorFromSession,
  requireWorkspaceSession,
} from "../../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const isOwner = session.workspace.role === "owner";
    const tokens = await listApiTokens(session.workspace.id, {
      userId: session.user.id,
      includeAll: isOwner,
    });
    return NextResponse.json({ tokens, canManageAll: isOwner, userId: session.user.id });
  } catch (error) {
    console.error("Failed to list API tokens", error);
    return NextResponse.json(
      { error: "API tokens could not be loaded" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const validation = createApiTokenSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: validation.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const created = await createApiToken(validation.data, actorFromSession(result.session));
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }
    console.error("Failed to create API token", error);
    return NextResponse.json(
      { error: "The API token could not be created" },
      { status: 500 },
    );
  }
}
