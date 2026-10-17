import { NextResponse } from "next/server";
import { bulkIssueSchema } from "../../../../server/bulkIssueSchemas";
import { bulkDeleteIssues, bulkUpdateIssues } from "../../../../server/bulkIssues";
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
    if (body.operation === "delete") {
      if (session.workspace.role !== "owner") {
        return NextResponse.json(
          { error: "Only workspace owners can delete issues" },
          { status: 403 },
        );
      }
      const results = await bulkDeleteIssues(body.issueIds, session.workspace.id);
      return NextResponse.json({ results });
    }

    const results = await bulkUpdateIssues(body, actorFromSession(session));
    return NextResponse.json({ results });
  } catch (error) {
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
