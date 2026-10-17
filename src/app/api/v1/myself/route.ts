import { authenticateApiRequest } from "../../../../server/publicApi";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if ("response" in auth) return auth.response;
  const { context } = auth;
  return NextResponse.json({
    accountId: context.user.id,
    displayName: context.user.name,
    emailAddress: context.user.email,
    active: true,
    role: context.role,
    organization: context.organization,
    self: `${context.baseUrl}/api/v1/myself`,
  });
}
