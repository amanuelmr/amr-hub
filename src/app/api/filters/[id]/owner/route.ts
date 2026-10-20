import { NextRequest, NextResponse } from "next/server";
import { changeFilterOwner, changeOwnerSchema, getFilter } from "../../../../../server/filters";
import {
  filterError,
  filterNotFound,
  filterSession,
  readJson,
  validationFailed,
  type FilterRouteContext,
} from "../../http";

/** Change the owner (current owner or a workspace owner). */
export async function PATCH(request: NextRequest, context: FilterRouteContext) {
  const auth = await filterSession(request);
  if ("response" in auth) return auth.response;
  const validation = changeOwnerSchema.safeParse(await readJson(request));
  if (!validation.success) return validationFailed(validation.error);
  try {
    const { id } = await context.params;
    const changed = await changeFilterOwner(
      id,
      validation.data.userId,
      auth.actor,
      auth.actor.organizationId,
    );
    if (!changed) return filterNotFound();
    // The previous owner may no longer see a private filter.
    const filter = await getFilter(id, auth.actor, auth.actor.organizationId);
    return filter ? NextResponse.json(filter) : new NextResponse(null, { status: 204 });
  } catch (error) {
    return filterError(error, "Filter owner could not be changed");
  }
}
