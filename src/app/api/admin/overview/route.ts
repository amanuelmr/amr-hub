import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../prisma/client";
import { requireWorkspaceSession } from "../../../../server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { workspace } = result.session;

  try {
    const [organization, members, projects, issues, owners] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: workspace.id },
        select: { createdAt: true },
      }),
      prisma.member.count({ where: { organizationId: workspace.id } }),
      prisma.project.count({ where: { organizationId: workspace.id, deletedAt: null } }),
      prisma.issue.count({ where: { organizationId: workspace.id, deletedAt: null } }),
      prisma.member.findMany({
        where: { organizationId: workspace.id, role: "owner" },
        select: { user: { select: { name: true, email: true } } },
      }),
    ]);

    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      key: workspace.key,
      slug: workspace.slug,
      role: workspace.role,
      createdAt: organization?.createdAt.toISOString() ?? null,
      counts: { members, projects, issues },
      owners: owners.map((owner) => owner.user),
    });
  } catch (error) {
    console.error("Failed to load workspace overview", error);
    return NextResponse.json(
      { error: "Workspace details could not be loaded" },
      { status: 500 },
    );
  }
}
