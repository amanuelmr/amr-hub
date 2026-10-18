import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse } from "../../../../../server/projectAccess";
import {
  createFilterSubscription,
  createSubscriptionSchema,
  deleteFilterSubscriptions,
  FilterNotFoundError,
  listFilterSubscriptions,
  SubscriptionLimitError,
} from "../../../../../server/filterSubscriptions";
import { requireWorkspaceSession } from "../../../../../server/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

/** The caller's subscriptions to this filter. */
export async function GET(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;

  try {
    return NextResponse.json(
      await listFilterSubscriptions(session.user.id, session.workspace.id, id),
    );
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to load filter subscriptions", error);
    return NextResponse.json(
      { error: "Subscriptions could not be loaded" },
      { status: 500 },
    );
  }
}

/**
 * Subscribes the caller to the filter. Subscriptions are personal, so viewers
 * (who can read the filter) may subscribe too.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = createSubscriptionSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error:
          validation.error.issues[0]?.message ?? "Invalid subscription schedule",
        details: validation.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const subscription = await createFilterSubscription(
      session.user.id,
      session.workspace.id,
      id,
      validation.data,
    );
    return NextResponse.json(subscription, { status: 201 });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    if (error instanceof FilterNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SubscriptionLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to create filter subscription", error);
    return NextResponse.json(
      { error: "Subscription could not be created" },
      { status: 500 },
    );
  }
}

/** `?subscriptionId=` removes one; without it, all of the caller's for this filter. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;
  const { id } = await context.params;
  const subscriptionId = request.nextUrl.searchParams.get("subscriptionId");

  try {
    const removed = await deleteFilterSubscriptions(
      session.user.id,
      session.workspace.id,
      id,
      subscriptionId,
    );
    if (removed === 0) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ removed });
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    console.error("Failed to delete filter subscription", error);
    return NextResponse.json(
      { error: "Subscription could not be removed" },
      { status: 500 },
    );
  }
}
