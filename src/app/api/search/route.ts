import { NextResponse } from "next/server";
import { z } from "zod";
import {
  JqlQueryError,
  MAX_SEARCH_LIMIT,
  searchOrganizationIssues,
} from "../../../server/jql";
import { requireWorkspaceSession } from "../../../server/session";

export const dynamic = "force-dynamic";

const searchSchema = z
  .object({
    jql: z.string().max(4000).default(""),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
    cursor: z.string().regex(/^\d+$/).nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;
  const { session } = result;

  try {
    const validation = searchSchema.safeParse(await request.json());

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await searchOrganizationIssues(
        session.workspace.id,
        session.user.id,
        validation.data,
      ),
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    if (error instanceof JqlQueryError) {
      return NextResponse.json(
        { error: error.message, position: error.detail.position },
        { status: 400 },
      );
    }

    console.error("Failed to search issues", error);
    return NextResponse.json(
      { error: "Issues could not be searched" },
      { status: 500 },
    );
  }
}
