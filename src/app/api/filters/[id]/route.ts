import { NextRequest, NextResponse } from "next/server";
import {
  deleteFilter,
  getFilter,
  updateFilter,
  updateFilterSchema,
} from "../../../../server/filters";
import {
  filterError,
  filterNotFound,
  filterSession,
  readJson,
  validationFailed,
  type FilterRouteContext,
} from "../http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: FilterRouteContext) {
  const auth = await filterSession(request);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await context.params;
    const filter = await getFilter(id, auth.actor, auth.actor.organizationId);
    return filter ? NextResponse.json(filter) : filterNotFound();
  } catch (error) {
    return filterError(error, "Filter could not be loaded");
  }
}

export async function PATCH(request: NextRequest, context: FilterRouteContext) {
  const auth = await filterSession(request);
  if ("response" in auth) return auth.response;
  const validation = updateFilterSchema.safeParse(await readJson(request));
  if (!validation.success) return validationFailed(validation.error);
  try {
    const { id } = await context.params;
    const updated = await updateFilter(id, validation.data, auth.actor, auth.actor.organizationId);
    if (!updated) return filterNotFound();
    return NextResponse.json(await getFilter(id, auth.actor, auth.actor.organizationId));
  } catch (error) {
    return filterError(error, "Filter could not be updated");
  }
}

export async function DELETE(request: NextRequest, context: FilterRouteContext) {
  const auth = await filterSession(request);
  if ("response" in auth) return auth.response;
  try {
    const { id } = await context.params;
    const deleted = await deleteFilter(id, auth.actor, auth.actor.organizationId);
    return deleted ? new NextResponse(null, { status: 204 }) : filterNotFound();
  } catch (error) {
    return filterError(error, "Filter could not be deleted");
  }
}
