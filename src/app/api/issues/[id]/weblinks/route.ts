import { NextRequest, NextResponse } from "next/server";
import { issueGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import {
  addWebLink,
  createWebLinkSchema,
  removeWebLink,
} from "../../../../../server/issueRelations";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../../server/session";
import {
  issueNotFound,
  readJsonBody,
  routeError,
  validationFailed,
  type IssueRouteContext,
} from "../_lib/routeErrors";

export async function POST(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = createWebLinkSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "edit");
    if (denied) return denied;
    const issue = await addWebLink(
      id,
      validation.data,
      actorFromSession(result.session),
    );
    if (!issue) return issueNotFound();
    return NextResponse.json(issue, { status: 201 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(error, "Failed to add web link", "Web link could not be added");
  }
}

export async function DELETE(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const body = (await readJsonBody(request)) as { linkId?: unknown };
    const linkId =
      request.nextUrl.searchParams.get("linkId") ??
      (typeof body.linkId === "string" ? body.linkId : null);
    if (!linkId) {
      return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    }
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "edit");
    if (denied) return denied;
    const issue = await removeWebLink(
      id,
      linkId,
      actorFromSession(result.session),
    );
    if (!issue) return issueNotFound("Link not found");
    return NextResponse.json(issue);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(
      error,
      "Failed to remove web link",
      "Web link could not be removed",
    );
  }
}
