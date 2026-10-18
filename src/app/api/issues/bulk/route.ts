import { NextResponse } from "next/server";
import { bulkIssueSchema } from "../../../../server/bulkIssueSchemas";
import { bulkArchiveIssues, bulkUpdateIssues } from "../../../../server/bulkIssues";
import { trashIssues } from "../../../../server/trash";
import {
  accessErrorResponse,
  accessUserFromSession,
} from "../../../../server/projectAccess";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../server/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = bulkIssueSchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const body = validation.data;
    const actor = actorFromSession(session);
    const user = accessUserFromSession(session);
    if (body.operation === "delete") {
      // Moves each item to the trash; per-item project permissions apply.
      const results = await trashIssues(body.issueIds, actor, user);
      return NextResponse.json({ results });
    }
    if (body.operation === "archive") {
      const results = await bulkArchiveIssues(body.issueIds, body.value, actor, user);
      return NextResponse.json({ results });
    }

    const results = await bulkUpdateIssues(body, actor);
    return NextResponse.json({ results });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    console.error("Failed to run bulk change", error);
    return NextResponse.json(
      { error: "Bulk change could not be completed" },
      { status: 500 },
    );
  }
}
