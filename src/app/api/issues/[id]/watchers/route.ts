import { NextRequest, NextResponse } from "next/server";
import {
  listWatchers,
  setWatching,
  watcherTargetSchema,
} from "../../../../../server/issueRelations";
import {
  actorFromSession,
  requireWorkspaceSession,
} from "../../../../../server/session";
import {
  issueNotFound,
  readJsonBody,
  routeError,
  validationFailed,
  type IssueRouteContext,
} from "../_lib/routeErrors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: IssueRouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const { id } = await context.params;
    const watchers = await listWatchers(id, result.session.workspace.id);
    if (!watchers) return issueNotFound();
    return NextResponse.json(watchers);
  } catch (error) {
    return routeError(
      error,
      "Failed to load watchers",
      "Watchers could not be loaded",
    );
  }
}

async function changeWatching(
  request: NextRequest,
  context: IssueRouteContext,
  watching: boolean,
) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const validation = watcherTargetSchema.safeParse(
      await readJsonBody(request),
    );
    if (!validation.success) return validationFailed(validation.error);
    const { id } = await context.params;
    const response = await setWatching(
      id,
      validation.data,
      watching,
      actorFromSession(result.session),
      result.session.workspace.role,
    );
    if (!response) return issueNotFound();
    return NextResponse.json(response);
  } catch (error) {
    return routeError(
      error,
      "Failed to update watchers",
      "Watchers could not be updated",
    );
  }
}

export function POST(request: NextRequest, context: IssueRouteContext) {
  return changeWatching(request, context, true);
}

export function DELETE(request: NextRequest, context: IssueRouteContext) {
  return changeWatching(request, context, false);
}
