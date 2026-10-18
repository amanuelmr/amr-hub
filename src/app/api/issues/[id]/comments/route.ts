import { NextRequest, NextResponse } from "next/server";
import { issueGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import {
  commentBodySchema,
  prepareCommentBody,
} from "../../../../../server/comments";
import { IssueActionError } from "../../../../../server/issueRelations";
import { addComment } from "../../../../../server/issues";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../server/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = commentBodySchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "comment");
    if (denied) return denied;
    const issue = await addComment(
      id,
      prepareCommentBody(validation.data.body),
      actorFromSession(session),
    );

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    return NextResponse.json(issue, { status: 201 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    if (error instanceof IssueActionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Failed to add comment", error);
    return NextResponse.json(
      { error: "Comment could not be added" },
      { status: 500 },
    );
  }
}
