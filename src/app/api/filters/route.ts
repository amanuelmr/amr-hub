import { NextRequest, NextResponse } from "next/server";
import {
  createFilter,
  createFilterSchema,
  getFilter,
  listFilters,
} from "../../../server/filters";
import { filterError, filterSession, readJson, validationFailed } from "./http";

export const dynamic = "force-dynamic";

/** Filters shared with the viewer: ?scope=all (default) | mine | starred. */
export async function GET(request: NextRequest) {
  const auth = await filterSession(request);
  if ("response" in auth) return auth.response;
  const raw = request.nextUrl.searchParams.get("scope");
  const scope = raw === "mine" || raw === "starred" ? raw : "all";
  try {
    return NextResponse.json(await listFilters(auth.actor, auth.actor.organizationId, scope));
  } catch (error) {
    return filterError(error, "Filters could not be loaded");
  }
}

export async function POST(request: NextRequest) {
  const auth = await filterSession(request);
  if ("response" in auth) return auth.response;
  const validation = createFilterSchema.safeParse(await readJson(request));
  if (!validation.success) return validationFailed(validation.error);
  try {
    const id = await createFilter(validation.data, auth.actor);
    return NextResponse.json(await getFilter(id, auth.actor, auth.actor.organizationId), {
      status: 201,
    });
  } catch (error) {
    return filterError(error, "Filter could not be saved");
  }
}
