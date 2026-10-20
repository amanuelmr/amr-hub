import { NextResponse } from "next/server";
import prisma from "../../../../../prisma/client";
import { apiError, authenticateApiRequest } from "../../../../server/publicApi";
import { visibleProjectWhere } from "../../../../server/projectAccess";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if ("response" in auth) return auth.response;
  const { context } = auth;

  try {
    const projects = await prisma.project.findMany({
      where: visibleProjectWhere(
        { id: context.user.id, role: context.role },
        context.organization.id,
      ),
      include: {
        lead: { select: { id: true, name: true, email: true } },
        workflowStatuses: {
          orderBy: { position: "asc" },
          select: { key: true, name: true, category: true },
        },
        issueTypes: {
          orderBy: { position: "asc" },
          select: { key: true, name: true, level: true },
        },
      },
      orderBy: { key: "asc" },
    });
    return NextResponse.json(
      projects.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        projectTypeKey: "software",
        style: project.boardType.toLowerCase(),
        archived: Boolean(project.archivedAt),
        lead: project.lead
          ? {
              accountId: project.lead.id,
              displayName: project.lead.name,
              emailAddress: project.lead.email,
            }
          : null,
        statuses: project.workflowStatuses,
        issueTypes: project.issueTypes,
        self: `${context.baseUrl}/api/v1/projects`,
      })),
    );
  } catch (error) {
    console.error("API: failed to list projects", error);
    return apiError(500, "Projects could not be loaded");
  }
}
