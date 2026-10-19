import { NextRequest, NextResponse } from "next/server";
import { getFilter, setFilterStar } from "../../../../../server/filters";
import { filterError, filterNotFound, filterSession, type FilterRouteContext } from "../../http";

async function star(request: NextRequest, context: FilterRouteContext, starred: boolean) {
  const auth = await filterSession(request);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await context.params;
    const done = await setFilterStar(id, starred, auth.actor, auth.actor.organizationId);
    if (!done) return filterNotFound();
    return NextResponse.json(await getFilter(id, auth.actor, auth.actor.organizationId));
  } catch (error) {
    return filterError(error, "Filter could not be starred");
  }
}

export function POST(request: NextRequest, context: FilterRouteContext) {
  return star(request, context, true);
}

export function DELETE(request: NextRequest, context: FilterRouteContext) {
  return star(request, context, false);
}
