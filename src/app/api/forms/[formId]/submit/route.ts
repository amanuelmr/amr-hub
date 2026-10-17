import { NextRequest, NextResponse } from "next/server";
import { FormSubmissionError, submitForm } from "../../../../../server/forms";
import { submitFormSchema } from "../../../../../server/formSchemas";
import { actorFromSession, requireWorkspaceSession } from "../../../../../server/session";
import { errorResponse, notFound, validationFailed } from "../../../projects/http";

type RouteContext = { params: Promise<{ formId: string }> };

export const dynamic = "force-dynamic";

/** Submitting creates a work item; Jira lets anyone with access submit, so viewers may too. */
export async function POST(request: NextRequest, context: RouteContext) {
  const result = await requireWorkspaceSession(request);
  if ("response" in result) return result.response;

  try {
    const validation = submitFormSchema.safeParse(await request.json());
    if (!validation.success) return validationFailed(validation.error);
    const { formId } = await context.params;
    const created = await submitForm(
      formId,
      validation.data.answers,
      actorFromSession(result.session),
    );
    return created ? NextResponse.json(created, { status: 201 }) : notFound("Form");
  } catch (error) {
    if (error instanceof FormSubmissionError) {
      return NextResponse.json(
        { error: error.message, fields: error.fields },
        { status: error.status },
      );
    }
    return errorResponse(error, "Form could not be submitted");
  }
}
