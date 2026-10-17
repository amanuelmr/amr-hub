import { NextRequest, NextResponse } from "next/server";
import {
  InvalidTargetVersionError,
  releaseVersion,
  releaseVersionSchema,
} from "../../../../../../../server/versions";
import { requireWorkspaceRole } from "../../../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../../http";

type RouteContext = {
  params: Promise<{ id: string; versionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const body = await request.text();
    const validation = releaseVersionSchema.safeParse(
      body ? JSON.parse(body) : {},
    );
    if (!validation.success) return validationFailed(validation.error);

    const { id, versionId } = await context.params;
    const version = await releaseVersion(
      id,
      versionId,
      validation.data,
      session.workspace.id,
    );
    return version ? NextResponse.json(version) : notFound("Version");
  } catch (error) {
    return errorResponse(error, "Version could not be released", [
      InvalidTargetVersionError,
    ]);
  }
}
