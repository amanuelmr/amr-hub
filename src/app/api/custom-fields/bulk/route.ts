import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../server/projectAccess";
import { bulkSetCustomFieldSchema } from "../../../../server/customFieldSchemas";
import { updateIssue } from "../../../../server/issues";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../server/session";
import { errorResponse, validationFailed } from "../../projects/http";

export const dynamic = "force-dynamic";

/**
 * POST { issueIds, fieldId, value }: sets (or clears, with null) one custom
 * field on many issues. Each issue is validated on its own; the response
 * matches /api/issues/bulk: { results: [{ id, ok, error?, issue? }] }.
 */
export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = bulkSetCustomFieldSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { issueIds, fieldId, value } = validation.data;
    const actor = actorFromSession(session);
    const results = [];
    for (const id of issueIds) {
      try {
        const issue = await updateIssue(id, { customFields: { [fieldId]: value } }, actor);
        results.push(
          issue ? { id, ok: true, issue } : { id, ok: false, error: "Issue not found" },
        );
      } catch (error) {
        results.push({
          id,
          ok: false,
          error: error instanceof Error ? error.message : "Could not be updated",
        });
      }
    }
    return NextResponse.json({ results });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return errorResponse(error, "Bulk change could not be completed");
  }
}
