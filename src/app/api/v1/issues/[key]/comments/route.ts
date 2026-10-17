import { NextResponse } from "next/server";
import prisma from "../../../../../../../prisma/client";
import { createCommentSchema } from "../../../../../../server/issueSchemas";
import { addComment } from "../../../../../../server/issues";
import {
  apiError,
  authenticateApiRequest,
  handleApiError,
  readJson,
  validationResponse,
} from "../../../../../../server/publicApi";

type RouteContext = { params: Promise<{ key: string }> };

export const dynamic = "force-dynamic";

/** POST /api/v1/issues/{key}/comments { body } → 201 with the comment */
export async function POST(request: Request, route: RouteContext) {
  const auth = await authenticateApiRequest(request, { write: true });
  if ("response" in auth) return auth.response;
  const { context } = auth;
  const key = (await route.params).key.toUpperCase();

  try {
    const validation = createCommentSchema.safeParse(await readJson(request));
    if (!validation.success) return validationResponse(validation.error);

    const issue = await addComment(key, validation.data.body, context.actor);
    if (!issue) return apiError(404, "Issue does not exist or you do not have permission to see it.");

    const comment = await prisma.comment.findFirst({
      where: { issueId: key, authorId: context.user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      {
        id: comment?.id ?? null,
        body: comment?.body ?? validation.data.body,
        author: { accountId: context.user.id, displayName: context.user.name },
        created: comment?.createdAt.toISOString() ?? new Date().toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "The comment could not be added");
  }
}
