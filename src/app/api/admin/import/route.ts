import { NextRequest, NextResponse } from "next/server";
import {
  ImportProjectError,
  importRequestSchema,
  runImport,
} from "../../../../server/csvImport";
import {
  actorFromSession,
  requireWorkspaceRole,
} from "../../../../server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const result = await requireWorkspaceRole(request, ["owner", "member"]);
  if ("response" in result) return result.response;

  try {
    const validation = importRequestSchema.safeParse(await request.json());
    if (!validation.success) {
      const flat = validation.error.flatten();
      return NextResponse.json(
        {
          error: flat.formErrors[0] ?? flat.fieldErrors.rows?.[0] ?? "Validation failed",
          fields: flat.fieldErrors,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await runImport(validation.data, actorFromSession(result.session)),
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (error instanceof ImportProjectError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("CSV import failed", error);
    return NextResponse.json({ error: "The import could not be completed" }, { status: 500 });
  }
}
