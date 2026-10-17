import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "../../../../server/audit";
import { exportFileName } from "../../../../server/csvExportCore";
import {
  ExportProjectError,
  exportIssuesCsv,
  exportIssuesJson,
} from "../../../../server/csvExport";
import { requireWorkspaceSession } from "../../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "json" ? "json" : "csv";
  const projectId = params.get("projectId") || null;

  try {
    const exported =
      format === "json"
        ? await exportIssuesJson(session.workspace.id, projectId)
        : await exportIssuesCsv(session.workspace.id, projectId);
    await recordAudit({
      organizationId: session.workspace.id,
      actor: { id: session.user.id, name: session.user.name },
      action: "export.downloaded",
      targetType: projectId ? "project" : "workspace",
      targetId: projectId ?? session.workspace.id,
      details: { format, scope: exported.scope, issues: exported.count },
    });
    const fileName = exportFileName(exported.scope, format);
    return new NextResponse(format === "csv" ? `\uFEFF${exported.body}` : exported.body, {
      headers: {
        "Content-Type":
          format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ExportProjectError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Export failed", error);
    return NextResponse.json({ error: "The export could not be generated" }, { status: 500 });
  }
}
