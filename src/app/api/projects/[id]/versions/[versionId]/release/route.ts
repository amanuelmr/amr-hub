import { NextRequest, NextResponse } from "next/server";
import {
  InvalidTargetVersionError,
  releaseVersion,
  releaseVersionSchema,
} from "../../../../../../../server/versions";
import { requireWorkspaceRole } from "../../../../../../../server/session";
import { runVersionAutomations } from "../../../../../../../server/automation";
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
    if (!version) return notFound("Version");
    await runVersionAutomations({
      versionId,
      projectId: id,
      actor: {
        id: session.user.id,
        name: session.user.name,
        organizationId: session.workspace.id,
      },
    });
    return NextResponse.json(version);
  } catch (error) {
    return errorResponse(error, "Version could not be released", [
      InvalidTargetVersionError,
    ]);
  }
}
