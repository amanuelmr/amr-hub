import { NextRequest, NextResponse } from "next/server";
import {
  contentDisposition,
  deleteAttachment,
  getAttachmentContent,
  normalizeMimeType,
} from "../../../../server/attachments";
import {
  actorFromSession,
  requireWorkspaceRole,
  requireWorkspaceSession,
} from "../../../../server/session";
import { accessUserFromSession, accessErrorResponse } from "../../../../server/projectAccess";
import { routeError } from "../../issues/[id]/_lib/routeErrors";

type RouteContext = {
  params: Promise<{ attachmentId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { attachmentId } = await context.params;
    const attachment = await getAttachmentContent(
      attachmentId,
      result.session.workspace.id,
      accessUserFromSession(result.session),
    );
    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    const mimeType = normalizeMimeType(attachment.mimeType);
    return new NextResponse(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(attachment.data.length),
        "Content-Disposition": contentDisposition(attachment.name, mimeType),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(
      error,
      "Failed to download attachment",
      "Attachment could not be downloaded",
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const { attachmentId } = await context.params;
    const issue = await deleteAttachment(
      attachmentId,
      actorFromSession(result.session),
      result.session.workspace.role,
    );
    if (!issue) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(issue);
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    return routeError(
      error,
      "Failed to delete attachment",
      "Attachment could not be deleted",
    );
  }
}
