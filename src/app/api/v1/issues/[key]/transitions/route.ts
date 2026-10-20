import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "../../../../../../../prisma/client";
import { visibleIssueWhere, type AccessUser } from "../../../../../../server/projectAccess";
import { updateIssueSchema } from "../../../../../../server/issueSchemas";
import { updateIssue } from "../../../../../../server/issues";
import {
  apiError,
  authenticateApiRequest,
  handleApiError,
  readJson,
  resolveTransitionStatus,
  validationResponse,
} from "../../../../../../server/publicApi";

type RouteContext = { params: Promise<{ key: string }> };

export const dynamic = "force-dynamic";

const NOT_FOUND = "Issue does not exist or you do not have permission to see it.";

const transitionBodySchema = z.union([
  z.object({ status: z.string().trim().min(1).max(80) }).passthrough(),
  z
    .object({
      transition: z.object({
        id: z.string().trim().min(1).max(80).optional(),
        name: z.string().trim().min(1).max(80).optional(),
      }),
    })
    .passthrough(),
]);

async function findIssue(key: string, organizationId: string, user: AccessUser) {
  return prisma.issue.findFirst({
    where: {
      id: key,
      ...visibleIssueWhere(user, organizationId, {
        includeArchived: true,
        includeArchivedProjects: true,
      }),
    },
    select: { id: true, projectId: true, status: true },
  });
}

/** GET: the statuses this issue can move to. */
export async function GET(request: Request, route: RouteContext) {
  const auth = await authenticateApiRequest(request);
  if ("response" in auth) return auth.response;
  const key = (await route.params).key.toUpperCase();

  try {
    const issue = await findIssue(key, auth.context.organization.id, {
      id: auth.context.user.id,
      role: auth.context.role,
    });
    if (!issue) return apiError(404, NOT_FOUND);
    const { statuses } = await resolveTransitionStatus(issue.projectId, issue.status);
    return NextResponse.json({
      transitions: statuses
        .filter((status) => status.key !== issue.status)
        .map((status) => ({
          id: status.key,
          name: status.name,
          to: { id: status.key, name: status.name, statusCategory: status.category },
        })),
    });
  } catch (error) {
    return handleApiError(error, "Transitions could not be loaded");
  }
}

/** POST { status } or Jira's { transition: { id } } → 204 */
export async function POST(request: Request, route: RouteContext) {
  const auth = await authenticateApiRequest(request, { write: true });
  if ("response" in auth) return auth.response;
  const { context } = auth;
  const key = (await route.params).key.toUpperCase();

  try {
    const body = transitionBodySchema.safeParse(await readJson(request));
    if (!body.success) return apiError(400, "Send { \"status\": \"In progress\" } or { \"transition\": { \"id\": \"IN_PROGRESS\" } }");
    const data = body.data as { status?: string; transition?: { id?: string; name?: string } };
    const requested = data.status ?? data.transition?.id ?? data.transition?.name ?? "";

    const issue = await findIssue(key, context.organization.id, {
      id: context.user.id,
      role: context.role,
    });
    if (!issue) return apiError(404, NOT_FOUND);

    const { key: statusKey, statuses } = await resolveTransitionStatus(issue.projectId, requested);
    if (!statusKey) {
      return apiError(400, `"${requested}" is not a status in this project's workflow`, {
        validStatuses: statuses.map((status) => status.name),
      });
    }

    const validation = updateIssueSchema.safeParse({ status: statusKey });
    if (!validation.success) return validationResponse(validation.error);
    const updated = await updateIssue(key, validation.data, context.actor);
    if (!updated) return apiError(404, NOT_FOUND);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "The issue could not be transitioned");
  }
}
