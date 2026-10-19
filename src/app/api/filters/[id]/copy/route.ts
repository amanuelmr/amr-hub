import { NextRequest, NextResponse } from "next/server";
import { copyFilter, getFilter } from "../../../../../server/filters";
import { filterError, filterNotFound, filterSession, type FilterRouteContext } from "../../http";

/** Jira "Copy filter": a private copy owned by you. */
export async function POST(request: NextRequest, context: FilterRouteContext) {
  const auth = await filterSession(request);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await context.params;
    const copyId = await copyFilter(id, auth.actor);
    if (!copyId) return filterNotFound();
    return NextResponse.json(await getFilter(copyId, auth.actor, auth.actor.organizationId), {
      status: 201,
    });
  } catch (error) {
    return filterError(error, "Filter could not be copied");
  }
}
