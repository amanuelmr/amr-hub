import { isWorkflowValidationError } from "../../../../server/workflows";
import { accessErrorResponse } from "../../../../server/projectAccess";
import { NextRequest, NextResponse } from "next/server";
import { rankIssuesSchema } from "../../../../server/projectSchemas";
import {
  InvalidRankTargetError,
  rankIssues,
  UnknownRankIssueError,
  UnknownRankSprintError,
} from "../../../../server/ranking";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../server/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = rankIssuesSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await rankIssues(validation.data, actorFromSession(result.session)),
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }
    if (
      error instanceof InvalidRankTargetError ||
      error instanceof UnknownRankIssueError ||
      error instanceof UnknownRankSprintError ||
      isWorkflowValidationError(error)
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to rank issues", error);
    return NextResponse.json(
      { error: "Issues could not be ranked" },
      { status: 500 },
    );
  }
}
