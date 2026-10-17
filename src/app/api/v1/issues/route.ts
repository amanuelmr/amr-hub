import { NextRequest, NextResponse } from "next/server";
import { createIssueSchema } from "../../../../server/issueSchemas";
import { createIssue } from "../../../../server/issues";
import { JqlQueryError, searchOrganizationIssues } from "../../../../server/jql";
import {
  apiError,
  apiIssueBodySchema,
  authenticateApiRequest,
  handleApiError,
  mapCreateFields,
  projectLookup,
  readJson,
  serializeApiIssue,
  validationResponse,
} from "../../../../server/publicApi";

export const dynamic = "force-dynamic";

const MAX_RESULTS = 100;

/** Jira-style search: GET /api/v1/issues?jql=&startAt=&maxResults= */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if ("response" in auth) return auth.response;
  const { context } = auth;
  const params = request.nextUrl.searchParams;
  const startAt = Math.max(Number.parseInt(params.get("startAt") ?? "0", 10) || 0, 0);
  const requested = Number.parseInt(params.get("maxResults") ?? "50", 10);
  const maxResults = Math.min(Math.max(Number.isFinite(requested) ? requested : 50, 1), MAX_RESULTS);

  try {
    const [result, projects] = await Promise.all([
      searchOrganizationIssues(context.organization.id, context.user.id, {
        jql: params.get("jql") ?? "",
        limit: maxResults,
        cursor: String(startAt),
      }),
      projectLookup(context.organization.id),
    ]);
    return NextResponse.json({
      startAt,
      maxResults,
      total: result.total,
      isLast: result.nextCursor === null,
      issues: result.issues.map((issue) => serializeApiIssue(issue, projects, context.baseUrl)),
    });
  } catch (error) {
    if (error instanceof JqlQueryError) {
      return apiError(400, `JQL error: ${error.message}`, { position: error.detail.position });
    }
    return handleApiError(error, "Search failed");
  }
}

/** POST /api/v1/issues { fields: { project, summary, issuetype, ... } } */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request, { write: true });
  if ("response" in auth) return auth.response;
  const { context } = auth;

  try {
    const body = apiIssueBodySchema.safeParse(await readJson(request));
    if (!body.success) return validationResponse(body.error);
    const input = await mapCreateFields(context.organization.id, body.data.fields);
    const validation = createIssueSchema.safeParse(input);
    if (!validation.success) return validationResponse(validation.error);

    const issue = await createIssue(validation.data, context.actor);
    return NextResponse.json(
      {
        id: issue.id,
        key: issue.id,
        self: `${context.baseUrl}/api/v1/issues/${encodeURIComponent(issue.id)}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "The issue could not be created");
  }
}
