import { NextRequest, NextResponse } from "next/server";
import { listAuditLogs, parseAuditDate } from "../../../../server/audit";
import { requireWorkspaceRole } from "../../../../server/session";

export const dynamic = "force-dynamic";

const ownersOnly = () =>
  NextResponse.json(
    { error: "Only workspace owners can view the audit log" },
    { status: 403 },
  );

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner"], ownersOnly);
  if ("response" in result) return result.response;
  const params = request.nextUrl.searchParams;

  try {
    const page = Number.parseInt(params.get("page") ?? "1", 10);
    const pageSize = Number.parseInt(params.get("pageSize") ?? "50", 10);
    return NextResponse.json(
      await listAuditLogs(result.session.workspace.id, {
        action: params.get("action") || null,
        from: parseAuditDate(params.get("from")),
        to: parseAuditDate(params.get("to"), true),
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 50,
      }),
    );
  } catch (error) {
    console.error("Failed to load audit log", error);
    return NextResponse.json(
      { error: "The audit log could not be loaded" },
      { status: 500 },
    );
  }
}
