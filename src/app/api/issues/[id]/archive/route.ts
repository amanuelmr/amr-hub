import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getIssue } from "../../../../../server/issues";
import {
  accessErrorResponse,
  accessUserFromSession,
} from "../../../../../server/projectAccess";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../server/session";
import { setIssueArchived } from "../../../../../server/trash";
import {
  readJsonBody,
  routeError,
  validationFailed,
  type IssueRouteContext,
} from "../_lib/routeErrors";

const archiveSchema = z.object({ archived: z.boolean().default(true) }).strict();

/** Archives ({ archived: true }) or unarchives a work item. Project admins only. */
export async function POST(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const { id } = await context.params;
    const validation = archiveSchema.safeParse(await readJsonBody(request));
    if (!validation.success) return validationFailed(validation.error);
    const user = accessUserFromSession(session);
    await setIssueArchived(
      id,
      validation.data.archived,
      actorFromSession(session),
      user,
    );
    return NextResponse.json(await getIssue(id, session.workspace.id, user));
  } catch (error) {
    return accessErrorResponse(error) ?? routeError(error, "Failed to archive issue", "Work item could not be archived");
  }
}
