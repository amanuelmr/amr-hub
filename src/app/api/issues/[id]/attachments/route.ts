import { NextRequest, NextResponse } from "next/server";
import { issueGuard, accessErrorResponse } from "../../../../../server/projectAccess";
import {
  createAttachments,
  listAttachments,
} from "../../../../../server/attachments";
import {
  actorFromSession,
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../../../server/session";
import {
  issueNotFound,
  routeError,
  type IssueRouteContext,
} from "../_lib/routeErrors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "view");
    if (denied) return denied;
    const attachments = await listAttachments(id, result.session.workspace.id);
    if (!attachments) return issueNotFound();
    return NextResponse.json(attachments);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(
      error,
      "Failed to load attachments",
      "Attachments could not be loaded",
    );
  }
}

export async function POST(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload files as multipart form data" },
      { status: 400 },
    );
  }

  try {
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => typeof entry !== "string");
    const { id } = await context.params;
    const denied = await issueGuard(result.session, id, "edit");
    if (denied) return denied;
    const response = await createAttachments(
      id,
      files,
      actorFromSession(result.session),
    );
    if (!response) return issueNotFound();
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(
      error,
      "Failed to upload attachments",
      "Attachments could not be uploaded",
    );
  }
}
