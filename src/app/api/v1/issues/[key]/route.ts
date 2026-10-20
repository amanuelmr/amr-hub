import { NextResponse } from "next/server";
import { deleteIssue } from "../../../../../server/issueOperations";
import { updateIssueSchema } from "../../../../../server/issueSchemas";
import { getIssue, updateIssue } from "../../../../../server/issues";
import {
  apiError,
  apiIssueBodySchema,
  authenticateApiRequest,
  handleApiError,
  mapUpdateFields,
  projectLookup,
  readJson,
  serializeApiIssue,
  validationResponse,
} from "../../../../../server/publicApi";

type RouteContext = { params: Promise<{ key: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, route: RouteContext) {
  const auth = await authenticateApiRequest(request);
  if ("response" in auth) return auth.response;
  const { context } = auth;
  const key = (await route.params).key.toUpperCase();

  try {
    const [issue, projects] = await Promise.all([
      getIssue(key, context.organization.id, { id: context.user.id, role: context.role }),
      projectLookup(context.organization.id),
    ]);
    if (!issue) return apiError(404, "Issue does not exist or you do not have permission to see it.");
    return NextResponse.json(serializeApiIssue(issue, projects, context.baseUrl));
  } catch (error) {
    return handleApiError(error, "The issue could not be loaded");
  }
}

/** PUT /api/v1/issues/{key} { fields: {...} } → 204 */
export async function PUT(request: Request, route: RouteContext) {
  const auth = await authenticateApiRequest(request, { write: true });
  if ("response" in auth) return auth.response;
  const { context } = auth;
  const key = (await route.params).key.toUpperCase();

  try {
    const body = apiIssueBodySchema.safeParse(await readJson(request));
    if (!body.success) return validationResponse(body.error);
    const updates = await mapUpdateFields(context.organization.id, body.data.fields);
    const validation = updateIssueSchema.safeParse(updates);
    if (!validation.success) return validationResponse(validation.error);

    const issue = await updateIssue(key, validation.data, context.actor);
    if (!issue) return apiError(404, "Issue does not exist or you do not have permission to see it.");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "The issue could not be updated");
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  const auth = await authenticateApiRequest(request, { write: true });
  if ("response" in auth) return auth.response;
  const { context } = auth;
  const key = (await route.params).key.toUpperCase();

  try {
    const deleted = await deleteIssue(key, context.actor, context.role);
    if (!deleted) return apiError(404, "Issue does not exist or you do not have permission to see it.");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "The issue could not be deleted");
  }
}
